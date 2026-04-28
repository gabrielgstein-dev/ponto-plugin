import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const saveSpy = vi.fn()
vi.mock('../../../lib/infrastructure/manual/manual-punch-provider', () => ({
  saveManualPunch: (time: string) => saveSpy(time),
}))

import { useManualPunch } from '../../../lib/presentation/hooks/useManualPunch'
import { mockStorageSet } from '../../setup/chrome-mock'

describe('useManualPunch', () => {
  beforeEach(() => {
    saveSpy.mockReset()
    saveSpy.mockResolvedValue(undefined)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 9, 7))
  })

  it('saves manual punch and reports success', async () => {
    const onToast = vi.fn()
    const onRefresh = vi.fn()
    const { result } = renderHook(() => useManualPunch(onToast, onRefresh))
    await act(async () => {
      await result.current.doPunch()
    })
    expect(saveSpy).toHaveBeenCalledWith('09:07')
    expect(onToast).toHaveBeenCalledWith('Ponto registrado: 09:07')
    expect(onRefresh).toHaveBeenCalled()
    expect(mockStorageSet).toHaveBeenCalled()
    expect(result.current.punching).toBe(false)
  })

  it('reports error toast on failure', async () => {
    saveSpy.mockRejectedValueOnce(new Error('boom'))
    const onToast = vi.fn()
    const onRefresh = vi.fn()
    const { result } = renderHook(() => useManualPunch(onToast, onRefresh))
    await act(async () => {
      await result.current.doPunch()
    })
    expect(onToast).toHaveBeenCalledWith('Erro ao registrar ponto')
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
