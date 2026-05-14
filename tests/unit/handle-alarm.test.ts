/**
 * handle-alarm — handlers de alarmes do background.
 *
 * Foco aqui é o slot 'entrada' (BUG 3): antes da correção, os mapas
 * REMINDER_SLOT_MAP e PUNCH_POPUP_SLOT_MAP não incluíam entrada, então
 * `punch_popup_entrada` e `reminder_entrada` viravam no-op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/application/punch-reminder-manager', () => ({
  startReminder: vi.fn().mockResolvedValue(undefined),
  resolveReminder: vi.fn().mockResolvedValue(undefined),
  DISMISSED_SLOTS_KEY: 'punchPopupDismissedSlots',
}))

vi.mock('../../lib/application/schedule-ts-notifications', () => ({
  resetTsScheduled: vi.fn(),
}))

const scheduleNotificationsSpy = vi.fn()
vi.mock('../../lib/application/schedule-notifications', () => ({
  scheduleNotifications: (...args: unknown[]) => scheduleNotificationsSpy(...args),
}))

import {
  handlePunchPopupAlarm,
  handleReminderAlarm,
  handleDailyReset,
} from '../../lib/application/handle-alarm'
import { startReminder } from '../../lib/application/punch-reminder-manager'
import {
  mockAlarmsClear,
  mockStorageGet,
} from '../setup/chrome-mock'

beforeEach(() => {
  // chrome.notifications não existe no mock global — stub local.
  ;(globalThis as { chrome: { notifications: unknown } }).chrome.notifications = {
    create: vi.fn((_id: string, _opts: unknown, cb: (id: string) => void) => cb('id')),
    clear: vi.fn(),
  }
})

describe("handlePunchPopupAlarm — slot 'entrada' (BUG 3)", () => {
  it('chama startReminder com slot=entrada para punch_popup_entrada', async () => {
    mockStorageGet.mockResolvedValueOnce({ alarm_time_punch_popup_entrada: '08:00' })
    await handlePunchPopupAlarm('punch_popup_entrada')
    expect(startReminder).toHaveBeenCalledWith('entrada', '08:00')
  })

  it('chama startReminder com slot=almoco para punch_popup_almoco (regression)', async () => {
    mockStorageGet.mockResolvedValueOnce({ alarm_time_punch_popup_almoco: '12:00' })
    await handlePunchPopupAlarm('punch_popup_almoco')
    expect(startReminder).toHaveBeenCalledWith('almoco', '12:00')
  })

  it('ignora alarme com nome desconhecido', async () => {
    await handlePunchPopupAlarm('punch_popup_invalid')
    expect(startReminder).not.toHaveBeenCalled()
  })
})

describe("handleReminderAlarm — slot 'entrada' (BUG 3)", () => {
  it('dispara notification para reminder_entrada quando entrada ainda não foi batida', async () => {
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: null, almoco: null, volta: null, saida: null },
      alarm_msg_reminder_entrada: 'Você ainda não bateu a entrada! (30 min em atraso)',
    })
    await handleReminderAlarm('reminder_entrada')
    const notif = (globalThis as { chrome: { notifications: { create: ReturnType<typeof vi.fn> } } })
      .chrome.notifications.create
    expect(notif).toHaveBeenCalledWith(
      'reminder_entrada',
      expect.objectContaining({
        title: 'Senior Ponto — Lembrete',
        message: 'Você ainda não bateu a entrada! (30 min em atraso)',
      }),
      expect.any(Function),
    )
  })

  it('NÃO dispara notification para reminder_entrada quando entrada já foi batida', async () => {
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: '07:58', almoco: null, volta: null, saida: null },
      alarm_msg_reminder_entrada: 'Você ainda não bateu a entrada! (30 min em atraso)',
    })
    await handleReminderAlarm('reminder_entrada')
    const notif = (globalThis as { chrome: { notifications: { create: ReturnType<typeof vi.fn> } } })
      .chrome.notifications.create
    expect(notif).not.toHaveBeenCalled()
  })
})

describe('handleDailyReset — reagenda entrada após reset', () => {
  beforeEach(() => {
    scheduleNotificationsSpy.mockClear()
    mockAlarmsClear.mockResolvedValue(true)
    ;(globalThis as { chrome: { alarms: { getAll: ReturnType<typeof vi.fn> } } })
      .chrome.alarms.getAll = vi.fn().mockResolvedValue([])
  })

  it('chama scheduleNotifications(null,null,null,null) após resetar o dia', async () => {
    mockStorageGet.mockResolvedValue({})
    await handleDailyReset()
    expect(scheduleNotificationsSpy).toHaveBeenCalledWith(null, null, null, null)
  })
})
