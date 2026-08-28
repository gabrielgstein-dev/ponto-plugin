/**
 * handleAutoPunchAlarm() — execução da batida automática no Senior.
 *
 * Regra de ouro desta feature: NUNCA falhar em silêncio. Se não bateu, tem que
 * existir (a) log com o motivo e (b) aviso visível pro usuário. Estes testes
 * travam esse contrato.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/application/auto-punch', () => ({ runAutoPunch: vi.fn() }))
vi.mock('../../lib/application/open-punch-page', () => ({ openPunchPage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/application/punch-reminder-manager', () => ({
  startReminder: vi.fn().mockResolvedValue(undefined),
  resolveReminder: vi.fn().mockResolvedValue(undefined),
  DISMISSED_SLOTS_KEY: 'punchPopupDismissedSlots',
}))
vi.mock('../../lib/application/punch-state', () => ({ isSlotPunchedToday: vi.fn().mockResolvedValue(false) }))
vi.mock('../../lib/domain/weekday-gate', () => ({ isReminderBlockedToday: vi.fn().mockResolvedValue(false) }))

import { handleAutoPunchAlarm } from '../../lib/application/handle-alarm'
import { runAutoPunch } from '../../lib/application/auto-punch'
import { openPunchPage } from '../../lib/application/open-punch-page'
import { startReminder } from '../../lib/application/punch-reminder-manager'
import { isSlotPunchedToday } from '../../lib/application/punch-state'
import { isReminderBlockedToday } from '../../lib/domain/weekday-gate'
import { getLogs, _resetForTests } from '../../lib/domain/log-store'
import {
  mockNotificationsCreate,
  mockAlarmsCreate,
  mockStorageGet,
  mockStorageSet,
} from '../setup/chrome-mock'

/** Tentativas já gastas que levam a próxima falha a ser a última. */
const LAST_ATTEMPT = 2

/**
 * Finge N tentativas já registradas HOJE para o slot. Sem isso todo teste de
 * falha entraria no caminho de retry e nunca exercitaria o fallback visível.
 */
function withAttempts(count: number): void {
  mockStorageGet.mockImplementation(async (key: unknown) => {
    if (typeof key === 'string' && key.startsWith('autopunch_attempt_')) {
      return { [key]: { date: new Date().toDateString(), count } }
    }
    return {}
  })
}

/** Alarmes `autopunch_*` criados — o retry é a única coisa que os cria aqui. */
function autoPunchAlarmsCreated(): Array<{ name: string; info: unknown }> {
  return mockAlarmsCreate.mock.calls
    .filter(c => String(c[0]).startsWith('autopunch_'))
    .map(c => ({ name: String(c[0]), info: c[1] }))
}

const mockRun = vi.mocked(runAutoPunch)
const mockOpenPage = vi.mocked(openPunchPage)
const mockStartReminder = vi.mocked(startReminder)
const mockSlotPunched = vi.mocked(isSlotPunchedToday)
const mockBlocked = vi.mocked(isReminderBlockedToday)

beforeEach(() => {
  _resetForTests()
  mockSlotPunched.mockResolvedValue(false)
  mockBlocked.mockResolvedValue(false)
  mockOpenPage.mockResolvedValue(undefined)
  mockStartReminder.mockResolvedValue(undefined)
})

async function logText(): Promise<string> {
  const entries = await getLogs()
  return entries.map(e => e.msg).join('\n')
}

function notifiedMessages(): string[] {
  return mockNotificationsCreate.mock.calls.map(c => (c[1] as { message: string })?.message ?? '')
}

/** Título + mensagem — o aviso ao usuário é a soma dos dois. */
function notifiedText(): string {
  return mockNotificationsCreate.mock.calls
    .map(c => {
      const o = c[1] as { title?: string; message?: string }
      return `${o?.title ?? ''} ${o?.message ?? ''}`
    })
    .join('\n')
}

describe('handleAutoPunchAlarm() — sucesso confirmado', () => {
  it('notifica o sucesso e NÃO aciona o fallback', async () => {
    mockRun.mockResolvedValue({ success: true, logs: [], punchTime: '08:03', confirmed: true })
    await handleAutoPunchAlarm('autopunch_entrada', Date.now())

    expect(mockRun).toHaveBeenCalled()
    expect(notifiedMessages().join()).toContain('08:03')
    expect(mockOpenPage).not.toHaveBeenCalled()
    expect(mockStartReminder).not.toHaveBeenCalled()
  })
})

// Regressão da "batida fantasma": o plugin dizia "bati" e o histórico do
// Senior estava vazio. Import aceito (HTTP 2xx) NÃO é prova de batida.
describe('handleAutoPunchAlarm() — batida fantasma (import aceito, servidor não confirma)', () => {
  beforeEach(() => {
    mockRun.mockResolvedValue({ success: true, logs: [], punchTime: '13:09', confirmed: false })
  })

  it('NUNCA afirma que bateu', async () => {
    await handleAutoPunchAlarm('autopunch_volta', Date.now())
    expect(notifiedMessages().join()).not.toContain('Bati ')
    expect(notifiedText()).toContain('NÃO confirmada')
  })

  it('manda o usuário conferir na fonte e abre o Senior', async () => {
    await handleAutoPunchAlarm('autopunch_volta', Date.now())
    expect(notifiedMessages().join()).toContain('Confira no Senior')
    expect(mockOpenPage).toHaveBeenCalled()
    expect(mockStartReminder).toHaveBeenCalled()
  })

  it('loga o estado não-confirmado com o horário enviado', async () => {
    await handleAutoPunchAlarm('autopunch_volta', Date.now())
    const text = await logText()
    expect(text).toContain('NÃO CONFIRMADO')
    expect(text).toContain('13:09')
  })
})

// A falha agora tem DUAS fases: as primeiras tentativas reagendam em silêncio
// (causas transitórias — token frio, SPA bootando — se resolvem sozinhas), e a
// ÚLTIMA aciona o fallback visível. O contrato "nunca silenciosa" não caiu:
// mudou de "na primeira falha" para "quando as tentativas acabam".
describe('handleAutoPunchAlarm() — falha nunca é silenciosa (última tentativa)', () => {
  beforeEach(() => {
    mockRun.mockResolvedValue({ success: false, logs: ['Nenhuma aba Senior encontrada'], punchTime: null, confirmed: false })
    withAttempts(LAST_ATTEMPT)
  })

  it('loga o motivo real da falha', async () => {
    await handleAutoPunchAlarm('autopunch_entrada', Date.now())
    const text = await logText()
    expect(text).toContain('FALHA em entrada')
    expect(text).toContain('Nenhuma aba Senior encontrada')
  })

  it('notifica o usuário mesmo se o lembrete não abrir', async () => {
    // startReminder tem guards próprios que podem não abrir popup nenhum —
    // a notificação é a garantia de que o usuário fica sabendo.
    mockStartReminder.mockResolvedValue(undefined)
    await handleAutoPunchAlarm('autopunch_entrada', Date.now())
    expect(notifiedMessages().join()).toContain('Não consegui bater')
  })

  it('aciona o fallback: abre o Senior e dispara o lembrete', async () => {
    await handleAutoPunchAlarm('autopunch_entrada', Date.now())
    expect(mockOpenPage).toHaveBeenCalled()
    expect(mockStartReminder).toHaveBeenCalledWith('entrada', '')
  })

  it('loga quando o próprio fallback falha ao abrir o Senior', async () => {
    mockOpenPage.mockRejectedValue(new Error('sem permissão de aba'))
    await handleAutoPunchAlarm('autopunch_entrada', Date.now())
    expect(await logText()).toContain('sem permissão de aba')
  })

  it('exceção dentro de runAutoPunch vira falha logada, não crash', async () => {
    mockRun.mockRejectedValue(new Error('token explodiu'))
    await expect(handleAutoPunchAlarm('autopunch_entrada', Date.now())).resolves.toBeUndefined()
    expect(await logText()).toContain('token explodiu')
  })

  it('esgotadas as tentativas, NÃO reagenda de novo', async () => {
    await handleAutoPunchAlarm('autopunch_entrada', Date.now())
    expect(autoPunchAlarmsCreated()).toHaveLength(0)
  })
})

// Regressão de 2026-07-21: falha às 09:43 por token frio e o slot morreu no
// dia — o alarme era de disparo único e o scheduleAutoPunch seguinte só
// logava "horário já passou".
describe('handleAutoPunchAlarm() — retry antes de desistir', () => {
  beforeEach(() => {
    mockRun.mockResolvedValue({ success: false, logs: ['Nenhum token encontrado'], punchTime: null, confirmed: false })
  })

  it('primeira falha reagenda o mesmo slot em vez de desistir', async () => {
    withAttempts(0)
    await handleAutoPunchAlarm('autopunch_volta', Date.now())

    const created = autoPunchAlarmsCreated()
    expect(created).toHaveLength(1)
    expect(created[0].name).toBe('autopunch_volta')
    // ~3min à frente (tolerância pra latência do teste)
    const deltaMin = ((created[0].info as { when: number }).when - Date.now()) / 60000
    expect(deltaMin).toBeGreaterThan(2.5)
    expect(deltaMin).toBeLessThan(3.5)
  })

  it('reagendar NÃO incomoda o usuário: sem notificação, sem abrir o Senior', async () => {
    withAttempts(0)
    await handleAutoPunchAlarm('autopunch_volta', Date.now())

    expect(notifiedText()).not.toContain('Não consegui bater')
    expect(mockOpenPage).not.toHaveBeenCalled()
    expect(mockStartReminder).not.toHaveBeenCalled()
  })

  it('mas o retry é rastreável no log — silencioso pro usuário, não pro diagnóstico', async () => {
    withAttempts(0)
    await handleAutoPunchAlarm('autopunch_volta', Date.now())

    const text = await logText()
    expect(text).toContain('FALHA em volta')
    expect(text).toContain('Nenhum token encontrado')
    expect(text).toMatch(/reagendado para \d{2}:\d{2} \(tentativa 2\/3\)/)
  })

  it('preserva o horário nominal para o lembrete de fallback da próxima tentativa', async () => {
    withAttempts(0)
    mockStorageGet.mockImplementationOnce(async () => ({ 'alarm_time_autopunch_volta': '13:30' }))
    await handleAutoPunchAlarm('autopunch_volta', Date.now())

    const rewrite = mockStorageSet.mock.calls.find(
      c => (c[0] as Record<string, unknown>)['alarm_time_autopunch_volta'] !== undefined,
    )
    expect(rewrite?.[0]).toEqual({ 'alarm_time_autopunch_volta': '13:30' })
  })

  it('storage quebrado não vira loop de retry — cai direto no fallback visível', async () => {
    mockStorageGet.mockRejectedValue(new Error('storage morreu'))
    await handleAutoPunchAlarm('autopunch_volta', Date.now())

    expect(autoPunchAlarmsCreated()).toHaveLength(0)
    expect(notifiedText()).toContain('Não consegui bater')
  })
})

describe('handleAutoPunchAlarm() — guards logam o motivo de não bater', () => {
  it('slot já batido: não bate e loga', async () => {
    mockSlotPunched.mockResolvedValue(true)
    await handleAutoPunchAlarm('autopunch_entrada', Date.now())
    expect(mockRun).not.toHaveBeenCalled()
    expect(await logText()).toContain('já batido hoje')
  })

  it('dia bloqueado: não bate e loga', async () => {
    mockBlocked.mockResolvedValue(true)
    await handleAutoPunchAlarm('autopunch_entrada', Date.now())
    expect(mockRun).not.toHaveBeenCalled()
    expect(await logText()).toContain('dia bloqueado')
  })

  it('alarme obsoleto (SO acordou tarde): não bate e loga o atraso', async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    await handleAutoPunchAlarm('autopunch_entrada', twoHoursAgo)
    expect(mockRun).not.toHaveBeenCalled()
    expect(await logText()).toContain('alarme obsoleto')
  })

  it('nome de alarme desconhecido é ignorado', async () => {
    await handleAutoPunchAlarm('autopunch_naoexiste', Date.now())
    expect(mockRun).not.toHaveBeenCalled()
  })
})
