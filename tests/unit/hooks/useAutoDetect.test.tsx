import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const detectorDetectSpy = vi.fn()
const applyTimesSpy = vi.fn()
const scheduleSpy = vi.fn()
const applyPartialSpy = vi.fn()
const calcSpy = vi.fn()
const addPendingPunchSpy = vi.fn()
const resetGpSpy = vi.fn()
const resetSeniorApiSpy = vi.fn()
const resetSeniorStorageSpy = vi.fn()

vi.mock('../../../lib/application/detect-punches', () => ({
  PunchDetector: class {
    detect(...a: unknown[]) {
      return detectorDetectSpy(...a)
    }
  },
  addPendingPunch: (...a: any[]) => addPendingPunchSpy(...a),
}))
vi.mock('../../../lib/application/apply-punches', () => ({
  applyTimes: (...a: any[]) => applyTimesSpy(...a),
}))
vi.mock('../../../lib/application/schedule-notifications', () => ({
  scheduleNotifications: (...a: any[]) => scheduleSpy(...a),
}))
vi.mock('../../../lib/application/state', () => ({
  applyPartialState: (...a: any[]) => applyPartialSpy(...a),
  state: { entrada: '08:00', almoco: null, volta: null, saida: null },
}))
vi.mock('../../../lib/application/calc-schedule', () => ({
  calcHorarios: (...a: any[]) => calcSpy(...a),
}))
vi.mock('../../../lib/domain/build-flags', () => ({
  ENABLE_SENIOR_INTEGRATION: true,
  ENABLE_MANUAL_PUNCH: true,
  ENABLE_NOTIFICATIONS: true,
  APP_NAME: 'TestApp',
}))
vi.mock('#company/providers', () => ({
  getCompanyPunchProviders: () => [{ name: 'gp', priority: 1, fetchPunches: vi.fn() }],
  resetGpPunchCache: (...a: any[]) => resetGpSpy(...a),
}))
vi.mock('../../../lib/infrastructure/senior/senior-storage-provider', () => ({
  SeniorStoragePunchProvider: class {},
  resetSeniorStorageCache: (...a: any[]) => resetSeniorStorageSpy(...a),
}))
vi.mock('../../../lib/infrastructure/senior/senior-api-provider', () => ({
  SeniorApiPunchProvider: class {},
  resetSeniorApiCache: (...a: any[]) => resetSeniorApiSpy(...a),
}))
vi.mock('../../../lib/infrastructure/senior/senior-scraper', () => ({
  SeniorScraperProvider: class {},
}))
vi.mock('../../../lib/infrastructure/manual/manual-punch-provider', () => ({
  ManualPunchProvider: class {},
}))

import { useAutoDetect } from '../../../lib/presentation/hooks/useAutoDetect'
import { triggerStorageChange } from '../../setup/chrome-mock'

const stateRepo = {} as any

async function flush() {
  // Allow pending microtasks (Promise resolutions) to run under fake timers
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useAutoDetect', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    detectorDetectSpy.mockReset()
    applyTimesSpy.mockReset()
    scheduleSpy.mockReset()
    applyPartialSpy.mockReset()
    calcSpy.mockReset()
    addPendingPunchSpy.mockReset()
    resetGpSpy.mockReset()
    resetSeniorApiSpy.mockReset()
    resetSeniorStorageSpy.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs initial detection and schedules notifications when changed', async () => {
    detectorDetectSpy.mockResolvedValue({ times: ['08:00'], source: 'gp' })
    applyTimesSpy.mockReturnValue(true)
    const onRender = vi.fn()
    const onToast = vi.fn()
    renderHook(() => useAutoDetect(stateRepo, onRender, onToast))
    await waitFor(() => expect(applyTimesSpy).toHaveBeenCalled())
    expect(scheduleSpy).toHaveBeenCalled()
  })

  it('skips applyTimes when silent and hash unchanged on subsequent detect', async () => {
    detectorDetectSpy.mockResolvedValue({ times: ['09:42'], source: 'gp' })
    applyTimesSpy.mockReturnValue(true)
    const { result } = renderHook(() => useAutoDetect(stateRepo, vi.fn(), vi.fn()))
    await waitFor(() => expect(applyTimesSpy).toHaveBeenCalled())
    applyTimesSpy.mockClear()
    await act(async () => {
      await result.current.detect(true, false)
    })
    expect(applyTimesSpy).not.toHaveBeenCalled()
  })

  it('does not schedule notifications when no change', async () => {
    detectorDetectSpy.mockResolvedValue({ times: ['07:30'], source: 'gp' })
    applyTimesSpy.mockReturnValue(false)
    renderHook(() => useAutoDetect(stateRepo, vi.fn(), vi.fn()))
    await waitFor(() => expect(applyTimesSpy).toHaveBeenCalled())
    expect(scheduleSpy).not.toHaveBeenCalled()
  })

  it('shows toast when no detection result and not silent', async () => {
    detectorDetectSpy.mockResolvedValue(null)
    const onToast = vi.fn()
    const { result } = renderHook(() => useAutoDetect(stateRepo, vi.fn(), onToast))
    await waitFor(() => expect(detectorDetectSpy).toHaveBeenCalled())
    onToast.mockClear()
    await act(async () => {
      await result.current.detect(false, true)
    })
    expect(onToast).toHaveBeenCalledWith('Nenhum batimento encontrado')
  })

  it('catches error and toasts when not silent', async () => {
    detectorDetectSpy.mockRejectedValue(new Error('boom'))
    const onToast = vi.fn()
    const { result } = renderHook(() => useAutoDetect(stateRepo, vi.fn(), onToast))
    await waitFor(() => expect(detectorDetectSpy).toHaveBeenCalled())
    onToast.mockClear()
    await act(async () => {
      await result.current.detect(false, true)
    })
    expect(onToast).toHaveBeenCalledWith('Erro ao detectar batimentos')
  })

  it('handles punchSuccessTs storage event with explicit time', async () => {
    detectorDetectSpy.mockResolvedValue(null)
    renderHook(() => useAutoDetect(stateRepo, vi.fn(), vi.fn()))
    await waitFor(() => expect(detectorDetectSpy).toHaveBeenCalled())
    detectorDetectSpy.mockClear()
    act(() => {
      triggerStorageChange(
        {
          punchSuccessTs: { newValue: 1 },
          punchSuccessTime: { newValue: '09:00' },
        },
        'local',
      )
    })
    expect(addPendingPunchSpy).toHaveBeenCalledWith('09:00')
    expect(resetGpSpy).toHaveBeenCalled()
    expect(resetSeniorApiSpy).toHaveBeenCalled()
    expect(resetSeniorStorageSpy).toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(15001)
    })
    expect(detectorDetectSpy).toHaveBeenCalled()
  })

  it('handles punchSuccessTs storage event with fallback time', async () => {
    detectorDetectSpy.mockResolvedValue(null)
    renderHook(() => useAutoDetect(stateRepo, vi.fn(), vi.fn()))
    await waitFor(() => expect(detectorDetectSpy).toHaveBeenCalled())
    vi.setSystemTime(new Date(2026, 0, 5, 10, 5))
    act(() => {
      triggerStorageChange({ punchSuccessTs: { newValue: 1 } }, 'local')
    })
    expect(addPendingPunchSpy).toHaveBeenCalledWith('10:05')
  })

  it('handles pontoState changes when remote differs', async () => {
    detectorDetectSpy.mockResolvedValue(null)
    const onRender = vi.fn()
    renderHook(() => useAutoDetect(stateRepo, onRender, vi.fn()))
    await waitFor(() => expect(detectorDetectSpy).toHaveBeenCalled())
    onRender.mockClear()
    act(() => {
      triggerStorageChange(
        {
          pontoState: {
            newValue: {
              entrada: '07:00',
              almoco: null,
              volta: null,
              saida: null,
            },
          },
        },
        'local',
      )
    })
    expect(applyPartialSpy).toHaveBeenCalled()
    expect(onRender).toHaveBeenCalled()
  })

  it('skips pontoState change when local matches incoming', async () => {
    detectorDetectSpy.mockResolvedValue(null)
    const onRender = vi.fn()
    renderHook(() => useAutoDetect(stateRepo, onRender, vi.fn()))
    await waitFor(() => expect(detectorDetectSpy).toHaveBeenCalled())
    onRender.mockClear()
    applyPartialSpy.mockClear()
    act(() => {
      triggerStorageChange(
        {
          pontoState: {
            newValue: { entrada: '08:00', almoco: null, volta: null, saida: null },
          },
        },
        'local',
      )
    })
    expect(applyPartialSpy).not.toHaveBeenCalled()
    expect(onRender).not.toHaveBeenCalled()
  })

  it('ignores storage change for non-local area', async () => {
    detectorDetectSpy.mockResolvedValue(null)
    renderHook(() => useAutoDetect(stateRepo, vi.fn(), vi.fn()))
    await waitFor(() => expect(detectorDetectSpy).toHaveBeenCalled())
    addPendingPunchSpy.mockClear()
    act(() => {
      triggerStorageChange({ punchSuccessTs: { newValue: 1 } }, 'sync')
    })
    expect(addPendingPunchSpy).not.toHaveBeenCalled()
  })

  it('polls every 15s and clears interval on unmount', async () => {
    detectorDetectSpy.mockResolvedValue(null)
    const { unmount } = renderHook(() => useAutoDetect(stateRepo, vi.fn(), vi.fn()))
    await waitFor(() => expect(detectorDetectSpy).toHaveBeenCalled())
    detectorDetectSpy.mockClear()
    act(() => {
      vi.advanceTimersByTime(15001)
    })
    expect(detectorDetectSpy).toHaveBeenCalled()
    unmount()
  })
})
