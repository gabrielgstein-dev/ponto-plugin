import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const fetchGpHistorySpy = vi.fn()
const saveSpy = vi.fn()
const removeSpy = vi.fn()
const updateSpy = vi.fn()
const addAjusteSpy = vi.fn()

const ensureInitializedSpy = vi.fn()
const recalculateSpy = vi.fn()
const getHistorySpy = vi.fn()

const mockBuildFlags = { ENABLE_SENIOR_INTEGRATION: true }
vi.mock('../../../lib/domain/build-flags', () => ({
  get ENABLE_SENIOR_INTEGRATION() {
    return mockBuildFlags.ENABLE_SENIOR_INTEGRATION
  },
  DEBUG: false,
  ACTIVE_COMPANY: 'meta',
  APP_NAME: 'TestApp',
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: false,
  ENABLE_WIDGET: false,
  ENABLE_YESTERDAY: false,
  ENABLE_NOTIFICATIONS: true,
  ENABLE_META_TIMESHEET: true,
  THEME: 'meta',
}))
vi.mock('../../../lib/infrastructure/manual/manual-hour-bank-provider', () => ({
  ManualHourBankProvider: class {
    ensureInitialized(...a: any[]) {
      return ensureInitializedSpy(...a)
    }
    recalculate(...a: any[]) {
      return recalculateSpy(...a)
    }
    getHistory(...a: any[]) {
      return getHistorySpy(...a)
    }
  },
}))
vi.mock('../../../lib/infrastructure/manual/manual-punch-provider', () => ({
  saveManualPunchForDate: (...a: any[]) => saveSpy(...a),
  removeManualPunchForDate: (...a: any[]) => removeSpy(...a),
  updateManualPunchForDate: (...a: any[]) => updateSpy(...a),
}))
vi.mock('#company/providers', () => ({
  fetchGpHistoryForPeriod: (...a: any[]) => fetchGpHistorySpy(...a),
}))
vi.mock('../../../lib/infrastructure/meta/gestaoponto/gp-ajuste', () => ({
  addGpPunchAjuste: (...a: any[]) => addAjusteSpy(...a),
}))

import { useSidePanelData } from '../../../lib/presentation/hooks/useSidePanelData'
import { mockStorageGet, triggerStorageChange } from '../../setup/chrome-mock'

describe('useSidePanelData', () => {
  beforeEach(() => {
    fetchGpHistorySpy.mockReset()
    saveSpy.mockReset()
    removeSpy.mockReset()
    updateSpy.mockReset()
    addAjusteSpy.mockReset()
    ensureInitializedSpy.mockReset()
    recalculateSpy.mockReset()
    getHistorySpy.mockReset()
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = true
  })

  it('loads from GP when integration enabled and GP returns data', async () => {
    fetchGpHistorySpy.mockResolvedValue({
      balance: { totalMinutes: 30, periodStart: '2026-04-01', periodEnd: '2026-04-30', carryOverMinutes: 0 },
      records: [
        { date: '2026-04-15', punches: ['08:00'], workedMinutes: 60, balanceMinutes: 0 },
        { date: '2026-04-16', punches: ['09:00'], workedMinutes: 60, balanceMinutes: 0 },
      ],
    })
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('gp'))
    expect(result.current.records[0].date).toBe('2026-04-16')
  })

  it('falls back to manual when GP returns null', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([
      { date: '2026-04-15', punches: ['08:00'], workedMinutes: 0, balanceMinutes: 0 },
    ])
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('manual'))
  })

  it('takes manual path directly when senior integration disabled', async () => {
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = false
    mockStorageGet.mockResolvedValue({ pontoSettings: { closingDay: 15 } })
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('manual'))
    expect(ensureInitializedSpy).toHaveBeenCalledWith(15)
  })

  it('reloads on relevant storage changes', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    renderHook(() => useSidePanelData())
    await waitFor(() => expect(getHistorySpy).toHaveBeenCalled())
    getHistorySpy.mockClear()
    act(() => {
      triggerStorageChange({ manualPunches: { newValue: {} } }, 'local')
    })
    await waitFor(() => expect(getHistorySpy).toHaveBeenCalled())
  })

  it('ignores unrelated storage changes', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    renderHook(() => useSidePanelData())
    await waitFor(() => expect(getHistorySpy).toHaveBeenCalled())
    getHistorySpy.mockClear()
    act(() => {
      triggerStorageChange({ unrelated: { newValue: 'x' } }, 'local')
    })
    expect(getHistorySpy).not.toHaveBeenCalled()
  })

  it('editPunch calls update when value changed and not empty', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('manual'))
    await act(async () => {
      await result.current.editPunch('2026-04-15', '08:00', '08:30')
    })
    expect(updateSpy).toHaveBeenCalledWith('2026-04-15', '08:00', '08:30')
  })

  it('editPunch does nothing when value unchanged or empty', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('manual'))
    await act(async () => {
      await result.current.editPunch('2026-04-15', '08:00', '08:00')
    })
    await act(async () => {
      await result.current.editPunch('2026-04-15', '08:00', '')
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('removePunch and addPunch delegate to providers', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('manual'))
    await act(async () => {
      await result.current.removePunch('2026-04-15', '08:00')
    })
    expect(removeSpy).toHaveBeenCalledWith('2026-04-15', '08:00')
    await act(async () => {
      await result.current.addPunch('2026-04-15', '09:00')
    })
    expect(saveSpy).toHaveBeenCalledWith('2026-04-15', '09:00')

    saveSpy.mockClear()
    await act(async () => {
      await result.current.addPunch('2026-04-15', '')
    })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('addGpPunch reloads when ok and forwards result', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    addAjusteSpy.mockResolvedValue({ ok: true, message: 'ok' })
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('manual'))
    fetchGpHistorySpy.mockClear()
    let out: any
    await act(async () => {
      out = await result.current.addGpPunch('2026-04-15', '14:00', 1)
    })
    expect(out.ok).toBe(true)
    expect(addAjusteSpy).toHaveBeenCalled()
  })

  it('addGpPunch does not reload when failure', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    addAjusteSpy.mockResolvedValue({ ok: false, message: 'fail' })
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('manual'))
    const callCountBefore = fetchGpHistorySpy.mock.calls.length
    await act(async () => {
      await result.current.addGpPunch('2026-04-15', '14:00', 2)
    })
    expect(fetchGpHistorySpy.mock.calls.length).toBe(callCountBefore)
  })

  it('navigates between periods', async () => {
    fetchGpHistorySpy.mockResolvedValue(null)
    mockStorageGet.mockResolvedValue({})
    ensureInitializedSpy.mockResolvedValue(undefined)
    recalculateSpy.mockResolvedValue({
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    })
    getHistorySpy.mockResolvedValue([])
    const { result } = renderHook(() => useSidePanelData())
    await waitFor(() => expect(result.current.source).toBe('manual'))
    act(() => result.current.goToPrev())
    expect(result.current.isCurrentPeriod).toBe(false)
    act(() => result.current.goToNext())
    expect(result.current.isCurrentPeriod).toBe(true)
    act(() => result.current.goToPrev())
    act(() => result.current.goToCurrent())
    expect(result.current.isCurrentPeriod).toBe(true)
  })
})
