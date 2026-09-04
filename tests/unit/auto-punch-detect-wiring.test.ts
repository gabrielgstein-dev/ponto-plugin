/**
 * Fiação entre a detecção e a batida automática.
 *
 * Por que existe: em 2026-09 o auto-punch parou de bater sem nenhum teste
 * quebrar. O merge do PR #53 resolveu um conflito em `background-detect.ts`
 * mantendo o lado da branch (anterior ao auto-punch) e apagou as chamadas a
 * `scheduleAutoPunch` — os alarmes deixaram de ser criados e a feature virou
 * código morto, silenciosamente.
 *
 * `scheduleAutoPunch` é o ÚNICO produtor dos alarmes `autopunch_*`. Sem ele
 * dentro do ciclo de detecção, o único agendamento que sobra é o do
 * `handleDailyReset` (meia-noite), que só computa a entrada: os slots seguintes
 * dependem de ser reagendados a cada detecção. Por isso os dois caminhos de
 * `backgroundDetect` — com e sem batimentos — são cobertos aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/domain/build-flags', () => ({
  DEBUG: false,
  ACTIVE_COMPANY: 'insi',
  APP_NAME: 'Test',
  ENABLE_SENIOR_INTEGRATION: true,
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: false,
  ENABLE_WIDGET: false,
  ENABLE_YESTERDAY: false,
  ENABLE_NOTIFICATIONS: false,
  ENABLE_META_TIMESHEET: false,
  ENABLE_AUTO_PUNCH: true,
  THEME: 'default',
}))

const { mockDetect } = vi.hoisted(() => ({
  mockDetect: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../lib/application/detect-punches', () => ({
  PunchDetector: vi.fn().mockImplementation(() => ({ detect: mockDetect })),
  loadPendingPunches: vi.fn().mockResolvedValue(undefined),
  addPendingPunch: vi.fn(),
}))

vi.mock('#company/providers', () => ({
  getCompanyPunchProviders: vi.fn().mockReturnValue([]),
  getTimesheetProvider: vi.fn().mockReturnValue({
    isAvailable: vi.fn().mockResolvedValue(false),
    getSummary: vi.fn().mockResolvedValue(null),
    name: 'metaTs',
  }),
}))

vi.mock('../../lib/application/calc-schedule', () => ({ calcHorarios: vi.fn() }))
vi.mock('../../lib/application/schedule-notifications', () => ({ scheduleNotifications: vi.fn() }))
vi.mock('../../lib/application/schedule-ts-notifications', () => ({
  scheduleTsNotifications: vi.fn(),
  resetTsScheduled: vi.fn(),
}))
vi.mock('../../lib/infrastructure/insi/timesheet/meta-ts-session', () => ({
  getMetaTsTokenSilently: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../lib/application/schedule-auto-punch', () => ({
  scheduleAutoPunch: vi.fn().mockResolvedValue(undefined),
  autoPunchSlotsEnabled: vi.fn().mockReturnValue([]),
  getTodayOffsets: vi.fn().mockResolvedValue({}),
  AUTO_PUNCH_ALARM_PREFIX: 'autopunch_',
  AUTO_PUNCH_SCHEDULE_KEY: 'autoPunchSchedule',
}))

import { backgroundDetect, resetBackgroundHash } from '../../lib/application/background-detect'
import { scheduleAutoPunch } from '../../lib/application/schedule-auto-punch'
import { mockStorageGet } from '../setup/chrome-mock'

const mockSchedule = vi.mocked(scheduleAutoPunch)

// Terça-feira, 18:00 — depois de todos os horários usados nos casos, porque o
// backgroundDetect só aplica batimentos que já passaram (`<= nowMin + 5`).
const FAKE_NOW = new Date(2026, 8, 1, 18, 0, 0)

beforeEach(() => {
  vi.useFakeTimers({ now: FAKE_NOW, shouldAdvanceTime: true })
  resetBackgroundHash()
  mockSchedule.mockClear()
  mockDetect.mockResolvedValue(null)
  mockStorageGet.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

/** Batimentos "no passado" — o filtro do backgroundDetect exige isso. */
function punchesAt(...times: string[]) {
  return { times, source: 'test' }
}

describe('backgroundDetect → scheduleAutoPunch', () => {
  it('sem batimentos detectados, ainda agenda a batida automática', async () => {
    // Caminho típico da manhã: Chrome aberto antes da entrada. É JUSTAMENTE
    // aqui que o alarme da entrada precisa nascer — se só agendássemos após
    // detectar algo, a entrada nunca seria batida sozinha.
    mockDetect.mockResolvedValue(null)

    await backgroundDetect('test')

    expect(mockSchedule).toHaveBeenCalledTimes(1)
  })

  it('com batimentos detectados, reagenda com o estado novo', async () => {
    // A corrente depende disso: cada slot batido libera o cálculo do próximo
    // (almoço → volta → saída). Sem o reagendamento pós-detecção, só a entrada
    // seria agendada no dia inteiro.
    mockStorageGet.mockResolvedValue({})
    mockDetect.mockResolvedValue(punchesAt('08:00', '12:00'))

    await backgroundDetect('test')

    expect(mockSchedule).toHaveBeenCalledTimes(1)
    const [entrada, almoco] = mockSchedule.mock.calls[0]
    expect(entrada).toBe(480) // 08:00
    expect(almoco).toBe(720) // 12:00
  })

  it('falha do agendamento não derruba o ciclo de detecção', async () => {
    mockSchedule.mockRejectedValue(new Error('alarms indisponível'))
    mockDetect.mockResolvedValue(null)

    await expect(backgroundDetect('test')).resolves.toBe(false)
  })
})
