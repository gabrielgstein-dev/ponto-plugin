import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClock } from '../../../lib/presentation/hooks/useClock'

describe('useClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 8, 30, 15)) // Mon Jan 5 2026 08:30:15
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns current time and date initially', () => {
    const { result } = renderHook(() => useClock())
    expect(result.current.time).toBe('08:30:15')
    expect(result.current.date).toBe('Segunda, 5 jan')
  })

  it('updates every second', () => {
    const { result } = renderHook(() => useClock())
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.time).toBe('08:30:16')
  })

  it('clears interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useClock())
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
