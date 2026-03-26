/**
 * F5 — Garantir sincronização Timesheet Meta
 *
 * Cobre os critérios:
 *   CV-5.1  getSummary retorna batimentos do período
 *   CV-5.2  isAvailable verifica se token está disponível
 *   CV-5.3  Dados mapeados para o formato interno (TimesheetEntry)
 *   CV-5.4  backgroundTimesheetSync armazena summary no cache
 *   CV-5.4b backgroundTimesheetSync respeita feature flag ENABLE_META_TIMESHEET
 *   CV-5.4c backgroundTimesheetSync throttle (tsAutoConnect 30min)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks de build-flags (precisamos controlar ENABLE_META_TIMESHEET) ─────────
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

const { mockTsIsAvailable, mockTsGetSummary } = vi.hoisted(() => ({
  mockTsIsAvailable: vi.fn().mockResolvedValue(true),
  mockTsGetSummary: vi.fn().mockResolvedValue(null),
}))

vi.mock('#company/providers', () => ({
  getCompanyPunchProviders: vi.fn().mockReturnValue([]),
  getTimesheetProvider: vi.fn().mockReturnValue({
    isAvailable: mockTsIsAvailable,
    getSummary: mockTsGetSummary,
    updateEntry: vi.fn().mockResolvedValue(true),
    name: 'metaTs',
  }),
}))

// background-detect imports detect-punches at module level
vi.mock('../../lib/application/detect-punches', () => ({
  PunchDetector: vi.fn().mockImplementation(() => ({ detect: vi.fn().mockResolvedValue(null) })),
  loadPendingPunches: vi.fn().mockResolvedValue(undefined),
  addPendingPunch: vi.fn(),
}))

vi.mock('../../lib/application/calc-schedule', () => ({ calcHorarios: vi.fn() }))
vi.mock('../../lib/application/schedule-notifications', () => ({ scheduleNotifications: vi.fn() }))
vi.mock('../../lib/application/schedule-ts-notifications', () => ({ scheduleTsNotifications: vi.fn() }))

import { backgroundTimesheetSync } from '../../lib/application/background-detect'
import { mockStorageGet, mockStorageSet, mockTabsCreate, mockTabsRemove, triggerStorageChange } from '../setup/chrome-mock'
import type { TimesheetSummary } from '../../lib/domain/types'

const MOCK_SUMMARY: TimesheetSummary = {
  period: '2026-03',
  pendingHours: 8,
  approvedHours: 32,
  reprovedHours: 0,
  totalReportedHours: 40,
  entries: [
    {
      id: 'entry-1',
      date: '2026-03-25',
      hourQuantity: 8,
      status: 'PENDING',
      costCenter: { code: '1001', name: 'Dev' },
      task: null,
      hourType: null,
      observation: null,
      isAutomatic: false,
    },
  ],
}

beforeEach(() => {
  mockTsIsAvailable.mockResolvedValue(true)
  mockTsGetSummary.mockResolvedValue(null)
  mockStorageGet.mockResolvedValue({ tsAutoConnectTs: 0 })
})

// ── createTimesheetProvider (unit) ────────────────────────────────────────────
describe('F5 — createTimesheetProvider', () => {
  it('CV-5.2: isAvailable retorna true quando auth.getToken() retorna token', async () => {
    const { createTimesheetProvider } = await import(
      '../../lib/infrastructure/timesheet/timesheet-provider'
    )
    const auth = {
      getToken: vi.fn().mockResolvedValue('valid-token'),
      getUserId: vi.fn().mockResolvedValue('user-123'),
    }
    const config = {
      apiUrl: 'https://api.example.com',
      timesheetsBase: '/timesheets',
      name: 'test',
    }
    const provider = createTimesheetProvider(config, auth)
    expect(await provider.isAvailable()).toBe(true)
  })

  it('CV-5.2: isAvailable retorna false quando auth.getToken() retorna null', async () => {
    const { createTimesheetProvider } = await import(
      '../../lib/infrastructure/timesheet/timesheet-provider'
    )
    const auth = {
      getToken: vi.fn().mockResolvedValue(null),
      getUserId: vi.fn().mockResolvedValue(null),
    }
    const config = { apiUrl: 'https://api.example.com', timesheetsBase: '/ts', name: 'test' }
    const provider = createTimesheetProvider(config, auth)
    expect(await provider.isAvailable()).toBe(false)
  })

  it('CV-5.1: getSummary retorna null quando sem token', async () => {
    const { createTimesheetProvider } = await import(
      '../../lib/infrastructure/timesheet/timesheet-provider'
    )
    const auth = {
      getToken: vi.fn().mockResolvedValue(null),
      getUserId: vi.fn().mockResolvedValue(null),
    }
    const config = { apiUrl: 'https://api.example.com', timesheetsBase: '/ts', name: 'test' }
    const provider = createTimesheetProvider(config, auth)
    expect(await provider.getSummary('2026-03')).toBeNull()
  })

  it('CV-5.3: getSummary chama os 3 endpoints e retorna apenas entradas PENDING', async () => {
    const { createTimesheetProvider } = await import(
      '../../lib/infrastructure/timesheet/timesheet-provider'
    )
    const auth = {
      getToken: vi.fn().mockResolvedValue('tok'),
      getUserId: vi.fn().mockResolvedValue('u1'),
    }
    const config = { apiUrl: 'https://ts.example.com', timesheetsBase: '/v1', name: 'test' }
    const provider = createTimesheetProvider(config, auth)

    // Mock fetch global
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    // hours-summary
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ pendingHours: 8, approvedHours: 16, repprovedHours: 0, totalReportedHours: 24, countReportedHours: 3 }),
    })
    // cost-centers
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ code: '1001', name: 'Dev' }] }),
    })
    // reported-hours with mix of PENDING and APPROVED
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [
          { id: 'e1', date: '2026-03-25', hourQuantity: 8, status: { title: 'PENDING', date: '', justify: null }, costCenter: null, task: null, hourType: null, observation: null, isAutomaticAppointment: false },
          { id: 'e2', date: '2026-03-24', hourQuantity: 8, status: { title: 'APPROVED', date: '', justify: null }, costCenter: null, task: null, hourType: null, observation: 'ok', isAutomaticAppointment: false },
        ],
        total: 2,
      }),
    })

    const summary = await provider.getSummary('2026-03')

    expect(summary).not.toBeNull()
    expect(summary!.pendingHours).toBe(8)
    expect(summary!.entries).toHaveLength(1) // apenas PENDING
    expect(summary!.entries[0].id).toBe('e1')
    expect(summary!.entries[0].status).toBe('PENDING')

    vi.unstubAllGlobals()
  })

  it('CV-5.3: updateEntry faz PATCH no endpoint correto', async () => {
    const { createTimesheetProvider } = await import(
      '../../lib/infrastructure/timesheet/timesheet-provider'
    )
    const auth = {
      getToken: vi.fn().mockResolvedValue('tok'),
      getUserId: vi.fn().mockResolvedValue('u1'),
    }
    const config = { apiUrl: 'https://ts.example.com', timesheetsBase: '/v1', name: 'test' }
    const provider = createTimesheetProvider(config, auth)

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('') })
    vi.stubGlobal('fetch', mockFetch)

    const entry = MOCK_SUMMARY.entries[0]
    const ok = await provider.updateEntry('entry-1', entry, { observation: 'Projeto X', hourQuantity: 8 })

    expect(ok).toBe(true)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('reported-hours/entry-1')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body)).toMatchObject({ observation: 'Projeto X', hourQuantity: 8 })

    vi.unstubAllGlobals()
  })
})

// ── backgroundTimesheetSync ───────────────────────────────────────────────────
describe('F5 — backgroundTimesheetSync()', () => {
  it('CV-5.4: quando provider disponível, armazena summary no cache', async () => {
    mockTsIsAvailable.mockResolvedValue(true)
    mockTsGetSummary.mockResolvedValue(MOCK_SUMMARY)

    await backgroundTimesheetSync()

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        timesheetSummaryCache: MOCK_SUMMARY,
        timesheetSyncTs: expect.any(Number),
      }),
    )
  })

  it('CV-5.4: quando getSummary retorna null, não armazena no cache', async () => {
    mockTsIsAvailable.mockResolvedValue(true)
    mockTsGetSummary.mockResolvedValue(null)

    await backgroundTimesheetSync()

    expect(mockStorageSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ timesheetSummaryCache: expect.anything() }),
    )
  })

  it('CV-5.4c: tsAutoConnect é throttled quando última tentativa foi há <30min', async () => {
    mockTsIsAvailable.mockResolvedValue(false)
    const recentTs = Date.now() - 5 * 60 * 1000 // 5 min atrás
    mockStorageGet.mockResolvedValue({ tsAutoConnectTs: recentTs })

    await backgroundTimesheetSync()

    // Não deve tentar abrir nova aba
    expect(mockTabsCreate).not.toHaveBeenCalled()
  })

  it('CV-5.4c: tsAutoConnect tenta abrir aba quando throttle expirou', async () => {
    mockTsIsAvailable.mockResolvedValueOnce(false) // primeiro check: sem token
    mockStorageGet.mockResolvedValue({ tsAutoConnectTs: 0 }) // sem throttle

    // Simula que a aba abre e token chega via storage change
    mockTabsCreate.mockImplementation(async () => {
      // Após criar a aba, dispara o evento de storage change com o token
      setTimeout(() => {
        triggerStorageChange({ metaTsToken: { newValue: 'new-token' } }, 'local')
      }, 10)
      return { id: 99 }
    })

    // Após auto-connect, isAvailable retorna true
    mockTsIsAvailable.mockResolvedValue(true)
    mockTsGetSummary.mockResolvedValue(MOCK_SUMMARY)

    await backgroundTimesheetSync()

    expect(mockTabsCreate).toHaveBeenCalled()
  })
})
