/**
 * BUG 1 — Background nunca abre abas em ciclos automáticos.
 *
 * Antes: a cada disparo de bgDetect (10min), backgroundDetect chamava
 * detector.detect(aggressive=true) que abria gestaoponto, e
 * backgroundTimesheetSync chamava tsAutoConnect que abria plataforma.meta.
 * Resultado: 2 abas aparecendo "do nada" pro usuário.
 *
 * Depois: nem backgroundDetect, nem backgroundTimesheetSync abrem abas
 * sem allowInteractive=true. Cache fica stale silenciosamente quando
 * não há auth — sync vem por outros gatilhos (webRequest, sidepanel).
 *
 * Este teste simula 20 ciclos consecutivos de bgDetect e verifica que
 * nenhuma chrome.tabs.create é chamada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/domain/build-flags', () => ({
  DEBUG: false,
  ACTIVE_COMPANY: 'meta',
  APP_NAME: 'Test',
  ENABLE_SENIOR_INTEGRATION: true,
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: false,
  ENABLE_WIDGET: false,
  ENABLE_YESTERDAY: false,
  ENABLE_NOTIFICATIONS: false,
  ENABLE_META_TIMESHEET: true,
  THEME: 'default',
}))

const { mockDetect, mockTsIsAvailable } = vi.hoisted(() => ({
  mockDetect: vi.fn().mockResolvedValue(null),
  mockTsIsAvailable: vi.fn().mockResolvedValue(false),
}))

vi.mock('../../lib/application/detect-punches', () => ({
  PunchDetector: vi.fn().mockImplementation(() => ({ detect: mockDetect })),
  loadPendingPunches: vi.fn().mockResolvedValue(undefined),
  addPendingPunch: vi.fn(),
}))

vi.mock('#company/providers', () => ({
  getCompanyPunchProviders: vi.fn().mockReturnValue([]),
  getTimesheetProvider: vi.fn().mockReturnValue({
    isAvailable: mockTsIsAvailable,
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
vi.mock('../../lib/infrastructure/meta/timesheet/meta-ts-session', () => ({
  getMetaTsTokenSilently: vi.fn().mockResolvedValue(null),
}))

import {
  backgroundDetect,
  backgroundTimesheetSync,
  resetBackgroundHash,
  notifyPendingTimesheet,
  resetTsNotifDebounce,
} from '../../lib/application/background-detect'
import {
  mockTabsCreate,
  mockWindowsCreate,
  mockStorageGet,
  triggerStorageChange,
} from '../setup/chrome-mock'

beforeEach(() => {
  resetBackgroundHash()
  resetTsNotifDebounce()
  mockTsIsAvailable.mockResolvedValue(false)
  mockDetect.mockResolvedValue(null)
})

describe('BUG 1 — Background silencioso (nunca abre abas em ciclos automáticos)', () => {
  it('20 disparos consecutivos de backgroundDetect → 0 chrome.tabs.create', async () => {
    // Sem token, sem batimentos, sem sessão — pior caso onde o master abriria
    // aba a cada disparo. Aqui não pode abrir nenhuma.
    mockStorageGet.mockResolvedValue({})
    mockTsIsAvailable.mockResolvedValue(false)

    for (let i = 0; i < 20; i++) {
      await backgroundDetect()
    }

    expect(mockTabsCreate).not.toHaveBeenCalled()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })

  it('20 disparos consecutivos de backgroundTimesheetSync (default) → 0 chrome.tabs.create', async () => {
    // Sem token e sem throttle — backgroundTimesheetSync default (sem
    // allowInteractive) NÃO pode abrir aba.
    mockStorageGet.mockResolvedValue({ tsAutoConnectTs: 0 })
    mockTsIsAvailable.mockResolvedValue(false)

    for (let i = 0; i < 20; i++) {
      await backgroundTimesheetSync()
    }

    expect(mockTabsCreate).not.toHaveBeenCalled()
  })

  it('ciclo combinado (bgDetect + tsSync) 20× → 0 abas', async () => {
    // Reproduz o ciclo do background.ts handler:
    //   await backgroundDetect();
    //   await backgroundTimesheetSync();
    mockStorageGet.mockResolvedValue({ tsAutoConnectTs: 0 })

    for (let i = 0; i < 20; i++) {
      await backgroundDetect()
      await backgroundTimesheetSync()
    }

    expect(mockTabsCreate).not.toHaveBeenCalled()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })

  it('notifyPendingTimesheet NÃO chama backgroundTimesheetSync (BUG 1: desacoplado)', async () => {
    // Cache vazio, sem pontoState — não deve abrir popup nem aba.
    mockStorageGet.mockResolvedValue({
      timesheetSummaryCache: null,
      tsNotifWindowId: null,
      pontoState: null,
      tsNotifDismissedTs: 0,
    })

    await notifyPendingTimesheet()

    expect(mockTabsCreate).not.toHaveBeenCalled()
    // Notar: mockTsIsAvailable é o spy do provider — se backgroundTimesheetSync
    // tivesse sido chamado, ele teria pelo menos chamado isAvailable.
    // Como notify só lê cache, isAvailable não pode ter sido chamado.
    expect(mockTsIsAvailable).not.toHaveBeenCalled()
  })

  it('backgroundTimesheetSync(true) — sidepanel — PODE abrir aba quando interactive', async () => {
    // Garante que o caminho explícito do sidepanel ainda funciona.
    mockStorageGet.mockResolvedValue({ tsAutoConnectTs: 0 })
    mockTsIsAvailable.mockResolvedValue(false)

    // Simula que após criar a aba, o token chega via storage change → resolve a promise interna
    mockTabsCreate.mockImplementation(async () => {
      setTimeout(() => {
        triggerStorageChange({ metaTsToken: { newValue: 'new-token' } }, 'local')
      }, 5)
      return { id: 99 }
    })

    await backgroundTimesheetSync(true)

    // Agora SIM, espera-se que tente abrir aba via tsAutoConnect.
    expect(mockTabsCreate).toHaveBeenCalled()
  })
})
