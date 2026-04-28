import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const checkAndCloseSpy = vi.fn()
vi.mock('../../../lib/application/manage-period', () => ({
  checkAndClosePeriod: (...args: any[]) => checkAndCloseSpy(...args),
}))

import { useHourBank } from '../../../lib/presentation/hooks/useHourBank'
import { DEFAULT_SETTINGS } from '../../../lib/domain/types'

describe('useHourBank', () => {
  it('does nothing when provider is null', async () => {
    const { result } = renderHook(() => useHourBank(null, DEFAULT_SETTINGS))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.balance).toBeNull()
    expect(checkAndCloseSpy).not.toHaveBeenCalled()
  })

  it('initializes provider, closes period and returns balance', async () => {
    const provider = {
      ensureInitialized: vi.fn().mockResolvedValue(undefined),
      recalculate: vi.fn().mockResolvedValue({
        totalMinutes: 60,
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        carryOverMinutes: 0,
      }),
    } as any
    const { result } = renderHook(() => useHourBank(provider, DEFAULT_SETTINGS))
    await waitFor(() => expect(result.current.balance?.totalMinutes).toBe(60))
    expect(provider.ensureInitialized).toHaveBeenCalledWith(DEFAULT_SETTINGS.closingDay)
    expect(checkAndCloseSpy).toHaveBeenCalledWith(provider, DEFAULT_SETTINGS)
  })
})
