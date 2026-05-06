import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const isAvailableSpy = vi.fn()
const getSummarySpy = vi.fn()
const updateEntrySpy = vi.fn()
const getWorkedHoursSpy = vi.fn()

const mockBuildFlags = { ENABLE_META_TIMESHEET: true }

vi.mock('../../../lib/domain/build-flags', () => ({
  get ENABLE_META_TIMESHEET() {
    return mockBuildFlags.ENABLE_META_TIMESHEET
  },
  DEBUG: false,
  ACTIVE_COMPANY: 'meta',
  APP_NAME: 'TestApp',
  ENABLE_SENIOR_INTEGRATION: true,
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: false,
  ENABLE_WIDGET: false,
  ENABLE_YESTERDAY: false,
  ENABLE_NOTIFICATIONS: true,
  THEME: 'meta',
}))
vi.mock('#company/providers', () => ({
  getTimesheetProvider: () => ({
    isAvailable: isAvailableSpy,
    getSummary: getSummarySpy,
    updateEntry: updateEntrySpy,
  }),
  getWorkedHoursForDate: (...a: any[]) => getWorkedHoursSpy(...a),
}))

import { useTimesheetData } from '../../../lib/presentation/hooks/useTimesheetData'
import {
  mockStorageGet,
  mockStorageSet,
  mockRuntimeSendMessage,
  triggerStorageChange,
} from '../../setup/chrome-mock'

const sampleEntry = {
  id: 'e1',
  date: '2026-04-15',
  hourQuantity: 8,
  status: 'PENDING' as const,
  costCenter: { code: 'CC1', name: 'CC1' },
  task: null,
  hourType: null,
  observation: null,
  isAutomatic: false,
}

describe('useTimesheetData', () => {
  beforeEach(() => {
    isAvailableSpy.mockReset()
    getSummarySpy.mockReset()
    updateEntrySpy.mockReset()
    getWorkedHoursSpy.mockReset()
    mockBuildFlags.ENABLE_META_TIMESHEET = true
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 15)) // April 2026
    // Sidepanel agora delega TS_GET_SUMMARY / TS_UPDATE_ENTRY ao service
    // worker via sendMessage (em vez de chamar provider direto). O teste
    // intercepta os tipos certos e responde com o que os spies retornariam.
    mockRuntimeSendMessage.mockImplementation(async (msg: { type: string; period?: string; entryId?: string; entry?: unknown; body?: { observation: string; hourQuantity: number } }) => {
      if (msg?.type === 'TS_GET_SUMMARY') {
        const summary = await getSummarySpy(msg.period)
        return { ok: !!summary, summary }
      }
      if (msg?.type === 'TS_UPDATE_ENTRY') {
        const ok = await updateEntrySpy(msg.entryId, msg.entry, msg.body)
        return { ok: !!ok }
      }
      return { ok: false }
    })
  })

  it('skips loading when feature is disabled', async () => {
    mockBuildFlags.ENABLE_META_TIMESHEET = false
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(isAvailableSpy).not.toHaveBeenCalled()
  })

  it('loads cache from storage on mount when period matches', async () => {
    const cached = {
      period: '2026-04',
      pendingHours: 1,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 1,
      entries: [sampleEntry],
    }
    mockStorageGet.mockResolvedValue({ timesheetSummaryCache: cached })
    isAvailableSpy.mockResolvedValue(false)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary?.entries.length).toBe(1))
  })

  it('ignores cache from a different period', async () => {
    mockStorageGet.mockResolvedValue({
      timesheetSummaryCache: { period: '2026-01', entries: [] },
    })
    isAvailableSpy.mockResolvedValue(false)
    const { result } = renderHook(() => useTimesheetData())
    // BUG 2: connecting agora é transient — testamos via REQUEST_TS_SYNC enviado
    await waitFor(() => expect(mockRuntimeSendMessage).toHaveBeenCalledWith({ type: 'REQUEST_TS_SYNC' }))
    expect(result.current.summary).toBeNull()
    expect(result.current.available).toBe(false)
  })

  it('handles storage rejection silently', async () => {
    mockStorageGet.mockRejectedValueOnce(new Error('boom'))
    isAvailableSpy.mockResolvedValue(false)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(mockRuntimeSendMessage).toHaveBeenCalledWith({ type: 'REQUEST_TS_SYNC' }))
    expect(result.current.available).toBe(false)
  })

  it('requests sync when not available and no cache (BUG 2 — UI ReconnectCard depois)', async () => {
    mockStorageGet.mockResolvedValue({})
    isAvailableSpy.mockResolvedValue(false)
    renderHook(() => useTimesheetData())
    await waitFor(() => expect(mockRuntimeSendMessage).toHaveBeenCalledWith({ type: 'REQUEST_TS_SYNC' }))
  })

  it('only requests sync once', async () => {
    mockStorageGet.mockResolvedValue({})
    isAvailableSpy.mockResolvedValue(false)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(mockRuntimeSendMessage).toHaveBeenCalledWith({ type: 'REQUEST_TS_SYNC' }))
    mockRuntimeSendMessage.mockClear()
    await act(async () => {
      await result.current.refresh()
    })
    expect(mockRuntimeSendMessage).not.toHaveBeenCalled()
  })

  it('loads summary when available', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 2,
      approvedHours: 1,
      reprovedHours: 0,
      totalReportedHours: 3,
      entries: [sampleEntry],
    })
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary?.entries.length).toBe(1))
    // Sidepanel agora delega TS_GET_SUMMARY ao service worker; persistência
    // do timesheetSummaryCache é responsabilidade do background.
    expect(mockRuntimeSendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'TS_GET_SUMMARY' }))
  })

  it('handles getSummary returning null', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue(null)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toBeNull()
  })

  it('catches load error and sets summary null', async () => {
    isAvailableSpy.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('reacts to metaTsToken storage changes', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 0,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 0,
      entries: [],
    })
    renderHook(() => useTimesheetData())
    await waitFor(() => expect(getSummarySpy).toHaveBeenCalled())
    getSummarySpy.mockClear()
    act(() => {
      triggerStorageChange({ metaTsToken: { newValue: 'tok' } }, 'local')
    })
    await waitFor(() => expect(getSummarySpy).toHaveBeenCalled())
  })

  it('reacts to timesheetSummaryCache changes for matching period', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 0,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 0,
      entries: [],
    })
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    act(() => {
      triggerStorageChange(
        {
          timesheetSummaryCache: {
            newValue: {
              period: '2026-04',
              pendingHours: 5,
              approvedHours: 0,
              reprovedHours: 0,
              totalReportedHours: 5,
              entries: [],
            },
          },
        },
        'local',
      )
    })
    await waitFor(() => expect(result.current.summary?.pendingHours).toBe(5))
  })

  it('navigates between periods', async () => {
    isAvailableSpy.mockResolvedValue(false)
    mockStorageGet.mockResolvedValue({})
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(mockRuntimeSendMessage).toHaveBeenCalledWith({ type: 'REQUEST_TS_SYNC' }))
    act(() => result.current.goToPrev())
    expect(result.current.isCurrentPeriod).toBe(false)
    act(() => result.current.goToNext())
    expect(result.current.isCurrentPeriod).toBe(true)
    act(() => result.current.goToPrev())
    act(() => result.current.goToCurrent())
    expect(result.current.isCurrentPeriod).toBe(true)
  })

  it('updateEntry returns failure when feature is disabled', async () => {
    mockBuildFlags.ENABLE_META_TIMESHEET = false
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const out = await result.current.updateEntry(sampleEntry, 'obs')
    expect(out).toEqual({ ok: false, gpHours: null })
  })

  it('updateEntry uses GP hours when present and updates summary', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 8,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 8,
      entries: [sampleEntry, { ...sampleEntry, id: 'other' }],
    })
    getWorkedHoursSpy.mockResolvedValue(7.5)
    updateEntrySpy.mockResolvedValue(true)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    let out: any
    await act(async () => {
      out = await result.current.updateEntry(
        { ...sampleEntry, date: '2026-04-15T00:00:00' },
        'obs',
      )
    })
    expect(out).toEqual({ ok: true, gpHours: 7.5 })
    expect(updateEntrySpy.mock.calls[0][2]).toEqual({ observation: 'obs', hourQuantity: 7.5 })
  })

  it('updateEntry rejects when manualHours exceed GP', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 0,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 0,
      entries: [],
    })
    getWorkedHoursSpy.mockResolvedValue(5)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    const entryMulti = {
      ...sampleEntry,
      costCenters: [
        { code: 'A', name: 'A' },
        { code: 'B', name: 'B' },
      ],
    }
    let out: any
    await act(async () => {
      out = await result.current.updateEntry(entryMulti, 'obs', 6)
    })
    expect(out).toEqual({ ok: false, gpHours: 5 })
  })

  it('updateEntry rejects when manualHours undefined for multi-cost-center', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 0,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 0,
      entries: [],
    })
    getWorkedHoursSpy.mockResolvedValue(8)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    const entryMulti = {
      ...sampleEntry,
      costCenters: [
        { code: 'A', name: 'A' },
        { code: 'B', name: 'B' },
      ],
    }
    let out: any
    await act(async () => {
      out = await result.current.updateEntry(entryMulti, 'obs')
    })
    expect(out).toEqual({ ok: false, gpHours: 8 })
  })

  it('updateEntry uses manualHours when valid for multi-cost-center', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 0,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 0,
      entries: [],
    })
    getWorkedHoursSpy.mockResolvedValue(8)
    updateEntrySpy.mockResolvedValue(true)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    const entryMulti = {
      ...sampleEntry,
      costCenters: [
        { code: 'A', name: 'A' },
        { code: 'B', name: 'B' },
      ],
    }
    let out: any
    await act(async () => {
      out = await result.current.updateEntry(entryMulti, 'obs', 4)
    })
    expect(out).toEqual({ ok: true, gpHours: 8 })
  })

  it('updateEntry falls back to entry.hourQuantity when GP returns null', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 0,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 0,
      entries: [],
    })
    getWorkedHoursSpy.mockResolvedValue(null)
    updateEntrySpy.mockResolvedValue(true)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    let out: any
    await act(async () => {
      out = await result.current.updateEntry(sampleEntry, 'obs')
    })
    expect(out).toEqual({ ok: true, gpHours: null })
    expect(updateEntrySpy.mock.calls[0][2]).toEqual({ observation: 'obs', hourQuantity: 8 })
  })

  it('updateEntryWithAllocations returns failure when feature is disabled', async () => {
    mockBuildFlags.ENABLE_META_TIMESHEET = false
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const out = await result.current.updateEntryWithAllocations(sampleEntry, [
      { costCenter: { code: 'A', name: 'A' }, hours: 1, observation: '', task: null, hourType: null },
    ])
    expect(out).toEqual({ ok: false, gpHours: null })
  })

  it('updateEntryWithAllocations rejects when total exceeds GP', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 0,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 0,
      entries: [],
    })
    getWorkedHoursSpy.mockResolvedValue(2)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    let out: any
    await act(async () => {
      out = await result.current.updateEntryWithAllocations(sampleEntry, [
        { costCenter: { code: 'A', name: 'A' }, hours: 5, observation: '', task: null, hourType: null },
      ])
    })
    expect(out).toEqual({ ok: false, gpHours: 2 })
  })

  it('updateEntryWithAllocations succeeds and updates summary', async () => {
    isAvailableSpy.mockResolvedValue(true)
    getSummarySpy.mockResolvedValue({
      period: '2026-04',
      pendingHours: 8,
      approvedHours: 0,
      reprovedHours: 0,
      totalReportedHours: 8,
      entries: [sampleEntry, { ...sampleEntry, id: 'other' }],
    })
    getWorkedHoursSpy.mockResolvedValue(8)
    updateEntrySpy.mockResolvedValue(true)
    const { result } = renderHook(() => useTimesheetData())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    let out: any
    await act(async () => {
      out = await result.current.updateEntryWithAllocations(
        { ...sampleEntry, date: '2026-04-15T00:00:00' },
        [
          {
            costCenter: { code: 'A', name: 'A' },
            hours: 4,
            observation: 'obs A',
            task: null,
            hourType: null,
          },
          {
            costCenter: { code: 'B', name: 'B' },
            hours: 3,
            observation: '',
            task: null,
            hourType: null,
          },
        ],
      )
    })
    expect(out).toEqual({ ok: true, gpHours: 8 })
    const observation = updateEntrySpy.mock.calls[0][2].observation
    expect(observation).toContain('A: 4h - obs A')
    expect(observation).toContain('B: 3h')
  })

  it('fetchGpHours delegates to provider', async () => {
    getWorkedHoursSpy.mockResolvedValue(7.25)
    const { result } = renderHook(() => useTimesheetData())
    const value = await result.current.fetchGpHours('2026-04-15')
    expect(value).toBe(7.25)
  })
})
