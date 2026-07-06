/**
 * handle-alarm — handlers de alarmes do background.
 *
 * Foco aqui é o slot 'entrada' (BUG 3): antes da correção, os mapas
 * REMINDER_SLOT_MAP e PUNCH_POPUP_SLOT_MAP não incluíam entrada, então
 * `punch_popup_entrada` e `reminder_entrada` viravam no-op.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Pin data pra weekday (2026-05-13 = quarta). settings.weekdaysOnly=true (default)
// bloqueia firing em sábado/domingo — sem pin, os testes quebram em fds.
const FAKE_NOW = new Date(2026, 4, 13, 12, 0, 0)

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
  mockStorageGetForHandler,
  mockStorageSet,
} from '../setup/chrome-mock'

beforeEach(() => {
  vi.useFakeTimers({ now: FAKE_NOW })
  // chrome.notifications não existe no mock global — stub local.
  ;(globalThis as { chrome: { notifications: unknown } }).chrome.notifications = {
    create: vi.fn((_id: string, _opts: unknown, cb: (id: string) => void) => cb('id')),
    clear: vi.fn(),
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe("handlePunchPopupAlarm — slot 'entrada' (BUG 3)", () => {
  it('chama startReminder com slot=entrada para punch_popup_entrada', async () => {
    mockStorageGetForHandler({ alarm_time_punch_popup_entrada: '08:00' })
    await handlePunchPopupAlarm('punch_popup_entrada')
    expect(startReminder).toHaveBeenCalledWith('entrada', '08:00')
  })

  it('chama startReminder com slot=almoco para punch_popup_almoco (regression)', async () => {
    mockStorageGetForHandler({ alarm_time_punch_popup_almoco: '12:00' })
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
    mockStorageGetForHandler({
      pontoState: { entrada: null, almoco: null, volta: null, saida: null },
      alarm_msg_reminder_entrada: 'Você ainda não bateu a entrada! (30 min em atraso)',
    })
    await handleReminderAlarm('reminder_entrada')
    const notif = (globalThis as { chrome: { notifications: { create: ReturnType<typeof vi.fn> } } })
      .chrome.notifications.create
    expect(notif).toHaveBeenCalledWith(
      'reminder_entrada',
      expect.objectContaining({
        title: 'Ponto Insi — Lembrete',
        message: 'Você ainda não bateu a entrada! (30 min em atraso)',
      }),
      expect.any(Function),
    )
  })

  it('NÃO dispara notification para reminder_entrada quando entrada já foi batida', async () => {
    mockStorageGetForHandler({
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

  // Anti-regressão: o reset diário NUNCA pode zerar seniorToken/seniorTokenTs.
  // Esses têm TTL nativo (SENIOR_TOKEN_MAX_AGE_MS=6.5d) + refresh silencioso
  // via seniorRefreshToken. Limpar a cada noite quebrava o caminho de refresh
  // em getSeniorAccessToken (que só dispara refresh se seniorToken existe),
  // deixando users que batem só pelo celular eternamente deslogados após a
  // primeira meia-noite. Mantemos seniorBearerToken/seniorBearerTs aqui
  // porque vêm de content script sem refresh próprio.
  it('NÃO zera seniorToken nem seniorRefreshToken no reset diário', async () => {
    mockStorageGet.mockResolvedValue({})
    mockStorageSet.mockClear()
    await handleDailyReset()

    const setCalls = mockStorageSet.mock.calls
    const allKeysWritten = new Set<string>()
    for (const [arg] of setCalls) {
      if (arg && typeof arg === 'object') {
        for (const k of Object.keys(arg)) allKeysWritten.add(k)
      }
    }
    expect(allKeysWritten.has('seniorToken')).toBe(false)
    expect(allKeysWritten.has('seniorTokenTs')).toBe(false)
    expect(allKeysWritten.has('seniorRefreshToken')).toBe(false)
    // Sanity: o reset ainda zera o que deve zerar
    expect(allKeysWritten.has('seniorBearerToken')).toBe(true)
    expect(allKeysWritten.has('seniorBearerTs')).toBe(true)
  })
})
