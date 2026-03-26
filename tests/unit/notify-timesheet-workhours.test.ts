/**
 * Unit — TS-W: notifyPendingTimesheet respeita janela de trabalho
 *
 * Garante que o popup ts-notification.html só abre se:
 *   - pontoState.entrada está registrada   (guard P6-equiv)
 *   - pontoState.saida ainda não foi batida (guard P7-equiv)
 */
import { describe, it, expect, vi } from 'vitest'

// ── Mocks de infra (mesmo padrão de f5-timesheet-sync.test.ts) ────────────────

vi.mock('../../lib/domain/build-flags', () => ({
  DEBUG: false,
  ACTIVE_COMPANY: 'meta',
  APP_NAME: 'Test',
  ENABLE_SENIOR_INTEGRATION: false,
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: false,
  ENABLE_WIDGET: false,
  ENABLE_YESTERDAY: false,
  ENABLE_NOTIFICATIONS: false,
  ENABLE_META_TIMESHEET: true,
  THEME: 'default',
}))

const { mockTsIsAvailable } = vi.hoisted(() => ({
  mockTsIsAvailable: vi.fn().mockResolvedValue(false),
}))

vi.mock('#company/providers', () => ({
  getCompanyPunchProviders: vi.fn().mockReturnValue([]),
  getTimesheetProvider: vi.fn().mockReturnValue({
    isAvailable: mockTsIsAvailable,
    getSummary: vi.fn().mockResolvedValue(null),
    updateEntry: vi.fn().mockResolvedValue(true),
    name: 'metaTs',
  }),
}))

vi.mock('../../lib/application/detect-punches', () => ({
  PunchDetector: vi.fn().mockImplementation(() => ({ detect: vi.fn().mockResolvedValue(null) })),
  loadPendingPunches: vi.fn().mockResolvedValue(undefined),
  addPendingPunch: vi.fn(),
}))

vi.mock('../../lib/application/calc-schedule', () => ({ calcHorarios: vi.fn() }))
vi.mock('../../lib/application/schedule-notifications', () => ({ scheduleNotifications: vi.fn() }))
vi.mock('../../lib/application/schedule-ts-notifications', () => ({
  scheduleTsNotifications: vi.fn(),
  resetTsScheduled: vi.fn(),
}))

import { notifyPendingTimesheet } from '../../lib/application/background-detect'
import { mockStorageGet, mockWindowsCreate } from '../setup/chrome-mock'

// ── helpers ──────────────────────────────────────────────────────────────────

const MOCK_SUMMARY = {
  period: '2026-03',
  pendingHours: 4,
  approvedHours: 0,
  reprovedHours: 0,
  totalReportedHours: 4,
  entries: [
    {
      id: 'entry-ts-1',
      date: '2026-03-25',
      hourQuantity: 4,
      status: 'PENDING',
      costCenter: { code: '1001', name: 'Dev' },
      task: null,
      hourType: null,
      observation: null,
      isAutomatic: false,
    },
  ],
}

/**
 * Configura os dois calls ao chrome.storage.local.get que ocorrem dentro de
 * notifyPendingTimesheet():
 *
 *   1ª chamada — tsAutoConnect (dentro de backgroundTimesheetSync) lê tsAutoConnectTs.
 *                Com timestamp recente, o throttle bloqueia e backgroundTimesheetSync retorna
 *                sem modificar o cache.
 *   2ª chamada — notifyPendingTimesheet lê timesheetSummaryCache + tsNotifWindowId + pontoState.
 */
function setupStorage(pontoState: unknown, summary: unknown = MOCK_SUMMARY): void {
  mockStorageGet
    .mockResolvedValueOnce({ tsAutoConnectTs: Date.now() })
    .mockResolvedValueOnce({ timesheetSummaryCache: summary, tsNotifWindowId: null, pontoState })
}

// ── TS-W1: pontoState null ────────────────────────────────────────────────────

describe('TS-W1 — pontoState null → não abre popup', () => {
  it('não chama windows.create quando pontoState é null', async () => {
    setupStorage(null)
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })
})

// ── TS-W2: entrada não registrada (P6-equiv) ──────────────────────────────────

describe('TS-W2 — entrada não registrada → não abre popup', () => {
  it('não abre popup quando entrada é null', async () => {
    setupStorage({ entrada: null, almoco: null, volta: null, saida: null })
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })

  it('não abre popup quando pontoState não tem o campo entrada', async () => {
    setupStorage({ almoco: null, volta: null, saida: null })
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })
})

// ── TS-W3: saída já batida (P7-equiv) ─────────────────────────────────────────

describe('TS-W3 — saída já batida → não abre popup', () => {
  it('não abre popup com jornada completa (entrada + almoco + volta + saida)', async () => {
    setupStorage({ entrada: '09:00', almoco: '12:00', volta: '13:00', saida: '18:00' })
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })

  it('não abre popup quando saida está preenchida mesmo sem almoco/volta', async () => {
    setupStorage({ entrada: '09:00', almoco: null, volta: null, saida: '14:00' })
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })
})

// ── TS-W4: dentro da janela de trabalho com pendentes → abre popup ─────────────

describe('TS-W4 — dentro da janela de trabalho com pendentes → abre popup', () => {
  it('abre popup quando só entrada registrada e há entradas pendentes sem obs', async () => {
    setupStorage({ entrada: '09:00', almoco: null, volta: null, saida: null })
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('ts-notification.html'),
        type: 'popup',
      }),
      expect.any(Function),
    )
  })

  it('abre popup quando entrada + almoco + volta registrados e saida é null', async () => {
    setupStorage({ entrada: '09:00', almoco: '12:00', volta: '13:00', saida: null })
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).toHaveBeenCalled()
  })

  it('URL do popup contém count correto de entradas pendentes', async () => {
    setupStorage({ entrada: '09:00', almoco: null, volta: null, saida: null })
    await notifyPendingTimesheet()
    const [opts] = mockWindowsCreate.mock.calls[0]
    expect(opts.url).toContain('count=1')
  })
})

// ── TS-W5: dentro da janela mas sem pendentes → não abre popup ───────────────

describe('TS-W5 — dentro da janela mas sem pendentes → não abre popup', () => {
  it('não abre popup quando timesheetSummaryCache é null', async () => {
    setupStorage({ entrada: '09:00', almoco: null, volta: null, saida: null }, null)
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })

  it('não abre popup quando todas as entradas estão APPROVED', async () => {
    const summaryApproved = {
      ...MOCK_SUMMARY,
      entries: [{ ...MOCK_SUMMARY.entries[0], status: 'APPROVED' }],
    }
    setupStorage({ entrada: '09:00', almoco: null, volta: null, saida: null }, summaryApproved)
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })

  it('não abre popup quando pendentes têm observation preenchida', async () => {
    const summaryWithObs = {
      ...MOCK_SUMMARY,
      entries: [{ ...MOCK_SUMMARY.entries[0], status: 'PENDING', observation: 'Projeto X' }],
    }
    setupStorage({ entrada: '09:00', almoco: null, volta: null, saida: null }, summaryWithObs)
    await notifyPendingTimesheet()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })
})
