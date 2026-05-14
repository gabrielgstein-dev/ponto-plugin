/**
 * Stale alarm guard — cenário wake-from-sleep.
 *
 * chrome.alarms persiste entre reinícios do service worker e dispara
 * imediatamente quando o SO acorda, mesmo que o `scheduledTime` já tenha
 * passado faz horas. Sem o guard, um `reminder_saida` agendado pras 16:36
 * dispara à noite quando o usuário liga o notebook, gerando notificação
 * tardia (e potencialmente errada, se o ponto já foi batido mas o storage
 * ainda não sincronizou).
 *
 * Threshold: 1h de drift entre `scheduledTime` e `Date.now()`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/application/punch-reminder-manager', () => ({
  startReminder: vi.fn().mockResolvedValue(undefined),
  resolveReminder: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/application/schedule-ts-notifications', () => ({
  resetTsScheduled: vi.fn(),
}))

import {
  handleNotifAlarm,
  handlePunchPopupAlarm,
  handleReminderAlarm,
} from '../../lib/application/handle-alarm'
import { startReminder } from '../../lib/application/punch-reminder-manager'
import { mockStorageGet, mockStorageRemove } from '../setup/chrome-mock'

const HOUR = 60 * 60 * 1000

function getNotifMock() {
  return (globalThis as { chrome: { notifications: { create: ReturnType<typeof vi.fn> } } })
    .chrome.notifications.create
}

beforeEach(() => {
  ;(globalThis as { chrome: { notifications: unknown } }).chrome.notifications = {
    create: vi.fn((_id: string, _opts: unknown, cb: (id: string) => void) => cb('id')),
    clear: vi.fn(),
  }
  // mockResolvedValueOnce queue não é limpa por clearAllMocks — se um teste
  // anterior enfileirou um valor que não foi consumido (porque o handler
  // saiu pelo early-return de stale), o valor vaza pro próximo teste. Reset
  // explícito + redefine default empty.
  mockStorageGet.mockReset()
  mockStorageGet.mockResolvedValue({})
})

// ── Cenário do usuário (2026-05-13): saída estimada 16:06, notebook off 16:20.
//    reminder_saida agendado pras 16:36 (saída + lembreteAtraso=30min default).
//    Notebook ligado ~22:00 → alarm dispara com ~5h30 de drift.

describe('handleReminderAlarm — stale alarm (wake-from-sleep)', () => {
  it('NÃO dispara notificação quando scheduledTime tem >1h de drift', async () => {
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: '08:00', almoco: null, volta: null, saida: null },
      alarm_msg_reminder_saida: 'Você ainda não bateu a saída! (30 min em atraso)',
    })
    const sixHoursAgo = Date.now() - 6 * HOUR
    await handleReminderAlarm('reminder_saida', sixHoursAgo)
    expect(getNotifMock()).not.toHaveBeenCalled()
  })

  it('limpa msgKey ANTES de notificar (não re-dispara em wake futuro)', async () => {
    // Apertado: sem o fix, `remove(msgKey)` também é chamado no path normal
    // de notificação, então essa asserção sozinha passaria. Adicionar a
    // verificação de que `notifications.create` NÃO foi chamado garante que
    // o caminho stale foi tomado.
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: '08:00', almoco: null, volta: null, saida: null },
      alarm_msg_reminder_saida: 'Você ainda não bateu a saída! (30 min em atraso)',
    })
    await handleReminderAlarm('reminder_saida', Date.now() - 6 * HOUR)
    expect(mockStorageRemove).toHaveBeenCalledWith('alarm_msg_reminder_saida')
    expect(getNotifMock()).not.toHaveBeenCalled()
  })

  it('NÃO consulta pontoState quando stale (curto-circuita antes de ler storage)', async () => {
    // Sem esse curto-circuito, o bug original aparece: ps.saida ainda não
    // sincronizou no wake → guard ps[slot] falha → notificação dispara.
    await handleReminderAlarm('reminder_saida', Date.now() - 6 * HOUR)
    // get() não deve ter sido chamado com a key pontoState
    const calls = mockStorageGet.mock.calls.flat().flat()
    expect(calls).not.toContain('pontoState')
  })

  it('AINDA dispara notificação quando scheduledTime é recente (<1h drift)', async () => {
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: '08:00', almoco: null, volta: null, saida: null },
      alarm_msg_reminder_saida: 'Você ainda não bateu a saída! (30 min em atraso)',
    })
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    await handleReminderAlarm('reminder_saida', fiveMinutesAgo)
    expect(getNotifMock()).toHaveBeenCalledWith(
      'reminder_saida',
      expect.objectContaining({ message: expect.stringContaining('saída') }),
      expect.any(Function),
    )
  })

  it('limite do threshold: 59min dispara, 61min suprime (cobre os dois lados)', async () => {
    // Sem o fix, ambos dispararam (handler não checa drift). Com o fix, só o
    // de 59min dispara. Sem o par, "exatamente 1h dispara" sozinho passaria
    // dos dois lados — não testando o limite de verdade.
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: '08:00', almoco: null, volta: null, saida: null },
      alarm_msg_reminder_saida: 'msg',
    })
    await handleReminderAlarm('reminder_saida', Date.now() - 59 * 60 * 1000)
    expect(getNotifMock()).toHaveBeenCalledTimes(1)

    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: '08:00', almoco: null, volta: null, saida: null },
      alarm_msg_reminder_saida: 'msg',
    })
    await handleReminderAlarm('reminder_saida', Date.now() - 61 * 60 * 1000)
    expect(getNotifMock()).toHaveBeenCalledTimes(1) // ainda 1, não disparou de novo
  })

  it('cenário-bug: ps.saida=null + drift de 6h → NÃO notifica (antes do fix, notificava)', async () => {
    // Reproduz exatamente o cenário do usuário:
    // - Punch em 16:06 não sincronizou pro storage antes do shutdown
    // - reminder_saida agendado pras 16:36 dispara à noite
    // - ps.saida=null no momento que o handler lê (sync ainda async)
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: '08:00', almoco: '12:00', volta: '13:00', saida: null },
      alarm_msg_reminder_saida: 'Você ainda não bateu a saída! (30 min em atraso)',
    })
    await handleReminderAlarm('reminder_saida', Date.now() - 5.5 * HOUR)
    expect(getNotifMock()).not.toHaveBeenCalled()
  })
})

describe('handlePunchPopupAlarm — stale alarm (wake-from-sleep)', () => {
  it('NÃO abre popup quando scheduledTime tem >1h de drift', async () => {
    await handlePunchPopupAlarm('punch_popup_saida', Date.now() - 6 * HOUR)
    expect(startReminder).not.toHaveBeenCalled()
  })

  it('limpa alarm_time key SEM chamar startReminder no path stale', async () => {
    // Apertado: o handler normal também chama remove(timeKey) no fim, então
    // a asserção de remove sozinha passa sem o fix. Verificar que
    // startReminder NÃO foi chamado garante que o curto-circuito rodou.
    await handlePunchPopupAlarm('punch_popup_saida', Date.now() - 6 * HOUR)
    expect(mockStorageRemove).toHaveBeenCalledWith('alarm_time_punch_popup_saida')
    expect(startReminder).not.toHaveBeenCalled()
  })

  it('AINDA abre popup quando scheduledTime é recente', async () => {
    mockStorageGet.mockResolvedValueOnce({ alarm_time_punch_popup_saida: '16:06' })
    await handlePunchPopupAlarm('punch_popup_saida', Date.now() - 2 * 60 * 1000)
    expect(startReminder).toHaveBeenCalledWith('saida', '16:06')
  })
})

describe('handleNotifAlarm — stale alarm (wake-from-sleep)', () => {
  it('NÃO dispara notificação quando scheduledTime tem >1h de drift', async () => {
    mockStorageGet.mockResolvedValueOnce({
      alarm_msg_notif_saida: 'Saída em 10 minutos! Prepare-se.',
    })
    await handleNotifAlarm('notif_saida', Date.now() - 6 * HOUR)
    expect(getNotifMock()).not.toHaveBeenCalled()
  })

  it('limpa msgKey SEM disparar notificação no path stale', async () => {
    // Apertado: handler normal também chama remove(msgKey) ao final. Sem
    // a asserção de não-notificou, esse teste passa mesmo sem o fix.
    mockStorageGet.mockResolvedValueOnce({
      alarm_msg_notif_saida: 'Saída em 10 minutos! Prepare-se.',
    })
    await handleNotifAlarm('notif_saida', Date.now() - 6 * HOUR)
    expect(mockStorageRemove).toHaveBeenCalledWith('alarm_msg_notif_saida')
    expect(getNotifMock()).not.toHaveBeenCalled()
  })

  it('AINDA dispara notificação "Prepare-se" quando scheduledTime é recente', async () => {
    mockStorageGet.mockResolvedValueOnce({
      alarm_msg_notif_saida: 'Saída em 10 minutos! Prepare-se.',
    })
    await handleNotifAlarm('notif_saida', Date.now() - 30 * 1000)
    expect(getNotifMock()).toHaveBeenCalledWith(
      'notif_saida',
      expect.objectContaining({
        title: 'Senior Ponto',
        message: 'Saída em 10 minutos! Prepare-se.',
      }),
      expect.any(Function),
    )
  })
})

// ── Backwards-compatibility: o param scheduledTime tem default Date.now()
//    pra não quebrar testes existentes que chamam só com alarmName.
describe('backwards compatibility — chamada sem scheduledTime', () => {
  it('handleReminderAlarm sem scheduledTime usa Date.now() (não stale)', async () => {
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: null, almoco: null, volta: null, saida: null },
      alarm_msg_reminder_entrada: 'msg',
    })
    await handleReminderAlarm('reminder_entrada')
    expect(getNotifMock()).toHaveBeenCalled()
  })

  it('handlePunchPopupAlarm sem scheduledTime usa Date.now() (não stale)', async () => {
    mockStorageGet.mockResolvedValueOnce({ alarm_time_punch_popup_entrada: '08:00' })
    await handlePunchPopupAlarm('punch_popup_entrada')
    expect(startReminder).toHaveBeenCalledWith('entrada', '08:00')
  })
})
