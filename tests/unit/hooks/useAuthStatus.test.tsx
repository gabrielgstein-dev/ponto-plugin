import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockStorageGet, triggerStorageChange } from '../../setup/chrome-mock'
import { useAuthStatus } from '../../../lib/presentation/hooks/useAuthStatus'

describe('useAuthStatus', () => {
  beforeEach(() => {
    // chrome.storage.local.get used here is the (key, callback) overload
    mockStorageGet.mockImplementation((keys: any, cb?: any) => {
      if (cb) cb({})
      return Promise.resolve({})
    })
  })

  it('returns null then false when nothing in storage', async () => {
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns true when gpAssertion present', async () => {
    mockStorageGet.mockImplementation((keys: any, cb?: any) => {
      const data = { gpAssertion: 'tok', gpAssertionTs: Date.now() }
      if (cb) cb(data)
      return Promise.resolve(data)
    })
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns true when seniorToken is fresh', async () => {
    mockStorageGet.mockImplementation((keys: any, cb?: any) => {
      const data = { seniorToken: 'tok', seniorTokenTs: Date.now() }
      if (cb) cb(data)
      return Promise.resolve(data)
    })
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false when seniorToken is stale', async () => {
    mockStorageGet.mockImplementation((keys: any, cb?: any) => {
      const data = { seniorToken: 'tok', seniorTokenTs: Date.now() - 4000000 }
      if (cb) cb(data)
      return Promise.resolve(data)
    })
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('rechecks when relevant storage keys change', async () => {
    let data: Record<string, unknown> = {}
    mockStorageGet.mockImplementation((_keys: any, cb?: any) => {
      if (cb) cb(data)
      return Promise.resolve(data)
    })
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current).toBe(false))

    data = { gpAssertion: 'tok', gpAssertionTs: Date.now() }
    act(() => {
      triggerStorageChange({ gpAssertion: { newValue: 'tok' } }, 'local')
    })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('ignores storage change for non-local area', async () => {
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current).toBe(false))
    mockStorageGet.mockClear()
    act(() => {
      triggerStorageChange({ gpAssertion: { newValue: 'tok' } }, 'sync')
    })
    expect(mockStorageGet).not.toHaveBeenCalled()
  })

  it('ignores storage change for unrelated keys', async () => {
    const { result } = renderHook(() => useAuthStatus())
    await waitFor(() => expect(result.current).toBe(false))
    mockStorageGet.mockClear()
    act(() => {
      triggerStorageChange({ unrelated: { newValue: 'x' } }, 'local')
    })
    expect(mockStorageGet).not.toHaveBeenCalled()
  })
})
