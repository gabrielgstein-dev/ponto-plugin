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
import { mockNotificationsCreate } from '../setup/chrome-mock'

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

describe('handleAutoPunchAlarm() — falha nunca é silenciosa', () => {
  beforeEach(() => {
    mockRun.mockResolvedValue({ success: false, logs: ['Nenhuma aba Senior encontrada'], punchTime: null, confirmed: false })
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
