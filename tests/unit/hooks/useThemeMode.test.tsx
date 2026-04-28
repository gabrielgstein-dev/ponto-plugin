import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockStorageGet, mockStorageSet, triggerStorageChange } from '../../setup/chrome-mock'

const STORAGE_KEY = 'senior-ponto-theme-mode'

function setMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = []
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_e: string, cb: any) => listeners.push(cb)),
    removeEventListener: vi.fn((_e: string, cb: any) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    }),
    dispatchChange: () => listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent)),
  }
  vi.spyOn(window, 'matchMedia').mockReturnValue(mql as any)
  return mql
}

describe('useThemeMode', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('initializes from system mode when nothing in localStorage (dark system)', async () => {
    setMatchMedia(true)
    mockStorageGet.mockResolvedValue({})
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    expect(result.current.themeMode).toBe('system')
    expect(result.current.isDark).toBe(true)
  })

  it('initializes from light mode in localStorage', async () => {
    setMatchMedia(false)
    localStorage.setItem(STORAGE_KEY, 'light')
    mockStorageGet.mockResolvedValue({})
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    expect(result.current.themeMode).toBe('light')
    expect(result.current.isDark).toBe(false)
  })

  it('toggleTheme: light → dark and persists', async () => {
    setMatchMedia(false)
    localStorage.setItem(STORAGE_KEY, 'light')
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.themeMode).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(mockStorageSet).toHaveBeenCalledWith({ [STORAGE_KEY]: 'dark' })
  })

  it('toggleTheme: dark → light', async () => {
    setMatchMedia(true)
    localStorage.setItem(STORAGE_KEY, 'dark')
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.themeMode).toBe('light')
  })

  it('toggleTheme: system + isDark → light, system + !isDark → dark', async () => {
    setMatchMedia(true)
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.themeMode).toBe('light')

    localStorage.removeItem(STORAGE_KEY)
    setMatchMedia(false)
    vi.resetModules()
    const { useThemeMode: useThemeModeFresh } = await import(
      '../../../lib/presentation/hooks/useThemeMode'
    )
    const { result: r2 } = renderHook(() => useThemeModeFresh())
    act(() => {
      r2.current.toggleTheme()
    })
    expect(r2.current.themeMode).toBe('dark')
  })

  it('reacts to system mode change in system mode', async () => {
    const mql = setMatchMedia(false)
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    expect(result.current.isDark).toBe(false)
    act(() => {
      mql.matches = true
      mql.dispatchChange()
    })
    expect(result.current.isDark).toBe(true)
  })

  it('hydrates from chrome.storage when value differs from local', async () => {
    setMatchMedia(false)
    localStorage.setItem(STORAGE_KEY, 'light')
    mockStorageGet.mockResolvedValue({ [STORAGE_KEY]: 'dark' })
    await import('../../../lib/presentation/hooks/useThemeMode')
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe('dark'))
  })

  it('ignores invalid hydration value', async () => {
    setMatchMedia(false)
    localStorage.setItem(STORAGE_KEY, 'light')
    mockStorageGet.mockResolvedValue({ [STORAGE_KEY]: 'INVALID' })
    await import('../../../lib/presentation/hooks/useThemeMode')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it('catches chrome.storage.get rejection silently', async () => {
    setMatchMedia(false)
    mockStorageGet.mockRejectedValue(new Error('boom'))
    await expect(
      import('../../../lib/presentation/hooks/useThemeMode'),
    ).resolves.toBeDefined()
  })

  it('reacts to remote storage change with valid value', async () => {
    setMatchMedia(false)
    localStorage.setItem(STORAGE_KEY, 'light')
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    act(() => {
      triggerStorageChange({ [STORAGE_KEY]: { newValue: 'dark', oldValue: 'light' } }, 'local')
    })
    await waitFor(() => expect(result.current.themeMode).toBe('dark'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('ignores storage change for non-local area', async () => {
    setMatchMedia(false)
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    act(() => {
      triggerStorageChange({ [STORAGE_KEY]: { newValue: 'dark' } }, 'sync')
    })
    expect(result.current.themeMode).toBe('system')
  })

  it('ignores storage change with invalid value or no relevant change', async () => {
    setMatchMedia(false)
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    act(() => {
      triggerStorageChange({ other: { newValue: 'whatever' } }, 'local')
    })
    act(() => {
      triggerStorageChange({ [STORAGE_KEY]: { newValue: 'INVALID' } }, 'local')
    })
    expect(result.current.themeMode).toBe('system')
  })

  it('setTheme also updates state', async () => {
    setMatchMedia(false)
    const { useThemeMode } = await import('../../../lib/presentation/hooks/useThemeMode')
    const { result } = renderHook(() => useThemeMode())
    act(() => {
      result.current.setTheme('dark')
    })
    expect(result.current.themeMode).toBe('dark')
  })
})
