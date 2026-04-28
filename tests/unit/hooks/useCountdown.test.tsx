import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from '../../../lib/presentation/hooks/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 8, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty string when target is null', () => {
    const { result } = renderHook(() => useCountdown(null))
    expect(result.current).toBe('')
  })

  it('returns empty when target is invalid', () => {
    const { result } = renderHook(() => useCountdown('abc'))
    expect(result.current).toBe('')
  })

  it('returns 00:00 when target already passed', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 9, 0, 0))
    const { result } = renderHook(() => useCountdown('08:00'))
    expect(result.current).toBe('00:00')
  })

  it('counts down to target time', () => {
    const { result, rerender } = renderHook(({ t }) => useCountdown(t), {
      initialProps: { t: '08:01' as string | null },
    })
    expect(result.current).toBe('00:01:00')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe('00:00:59')

    rerender({ t: null })
    expect(result.current).toBe('')
  })

  it('clears interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useCountdown('09:00'))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
