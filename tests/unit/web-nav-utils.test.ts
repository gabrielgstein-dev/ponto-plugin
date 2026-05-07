import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitForNavigation } from '../../lib/domain/web-nav-utils'

interface CompletedListener {
  (details: { tabId: number; frameId: number; url: string }): void
}

describe('waitForNavigation', () => {
  let completedListeners: CompletedListener[] = []
  let historyListeners: CompletedListener[] = []
  let removedListeners: ((tabId: number) => void)[] = []

  beforeEach(() => {
    completedListeners = []
    historyListeners = []
    removedListeners = []
    ;(globalThis as { chrome?: unknown }).chrome = {
      webNavigation: {
        onCompleted: {
          addListener: (fn: CompletedListener) => completedListeners.push(fn),
          removeListener: (fn: CompletedListener) => {
            completedListeners = completedListeners.filter(l => l !== fn)
          },
        },
        onHistoryStateUpdated: {
          addListener: (fn: CompletedListener) => historyListeners.push(fn),
          removeListener: (fn: CompletedListener) => {
            historyListeners = historyListeners.filter(l => l !== fn)
          },
        },
      },
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 1, status: 'loading', url: 'about:blank' }),
        onRemoved: {
          addListener: (fn: (tabId: number) => void) => removedListeners.push(fn),
          removeListener: (fn: (tabId: number) => void) => {
            removedListeners = removedListeners.filter(l => l !== fn)
          },
        },
      },
    }
  })

  it('resolve com URL quando webNavigation.onCompleted dispara para o tabId+path certo', async () => {
    const promise = waitForNavigation(99, { urlContains: '/modules/timesheet/create', timeoutMs: 5000 })
    await new Promise(r => setTimeout(r, 0))
    completedListeners.forEach(fn => fn({
      tabId: 99,
      frameId: 0,
      url: 'https://plataforma.meta.com.br/modules/timesheet/create',
    }))
    expect(await promise).toBe('https://plataforma.meta.com.br/modules/timesheet/create')
  })

  it('ignora eventos de outros tabIds', async () => {
    vi.useFakeTimers()
    const promise = waitForNavigation(99, { urlContains: '/x', timeoutMs: 1000 })
    promise.catch(() => { /* */ })
    completedListeners.forEach(fn => fn({ tabId: 100, frameId: 0, url: 'https://example.com/x' }))
    await vi.advanceTimersByTimeAsync(1100)
    expect(await promise).toBeNull()
    vi.useRealTimers()
  })

  it('ignora subframes (frameId !== 0)', async () => {
    vi.useFakeTimers()
    const promise = waitForNavigation(99, { urlContains: '/x', timeoutMs: 1000 })
    promise.catch(() => { /* */ })
    completedListeners.forEach(fn => fn({ tabId: 99, frameId: 5, url: 'https://example.com/x' }))
    await vi.advanceTimersByTimeAsync(1100)
    expect(await promise).toBeNull()
    vi.useRealTimers()
  })

  it('resolve via onHistoryStateUpdated (SPA route change)', async () => {
    const promise = waitForNavigation(99, { urlContains: '/timesheet', timeoutMs: 5000 })
    await new Promise(r => setTimeout(r, 0))
    historyListeners.forEach(fn => fn({
      tabId: 99,
      frameId: 0,
      url: 'https://plataforma.meta.com.br/timesheet/create',
    }))
    expect(await promise).toBe('https://plataforma.meta.com.br/timesheet/create')
  })

  it('resolve null quando aba é removida', async () => {
    const promise = waitForNavigation(99, { urlContains: '/x', timeoutMs: 5000 })
    await new Promise(r => setTimeout(r, 0))
    removedListeners.forEach(fn => fn(99))
    expect(await promise).toBeNull()
  })

  it('resolve null em timeout', async () => {
    vi.useFakeTimers()
    const promise = waitForNavigation(99, { urlContains: '/x', timeoutMs: 500 })
    promise.catch(() => { /* */ })
    await vi.advanceTimersByTimeAsync(600)
    expect(await promise).toBeNull()
    vi.useRealTimers()
  })

  it('fast path: resolve imediato se aba já está em URL esperada', async () => {
    ;(globalThis as { chrome: { tabs: { get: ReturnType<typeof vi.fn> } } }).chrome.tabs.get = vi.fn()
      .mockResolvedValue({
        id: 99,
        status: 'complete',
        url: 'https://plataforma.meta.com.br/modules/timesheet/create',
      })
    const result = await waitForNavigation(99, { urlContains: '/modules/timesheet/create', timeoutMs: 5000 })
    expect(result).toBe('https://plataforma.meta.com.br/modules/timesheet/create')
  })

  it('remove listeners após resolver (sem leak)', async () => {
    const promise = waitForNavigation(99, { urlContains: '/x', timeoutMs: 5000 })
    await new Promise(r => setTimeout(r, 0))
    expect(completedListeners.length).toBe(1)
    expect(historyListeners.length).toBe(1)
    expect(removedListeners.length).toBe(1)
    completedListeners.forEach(fn => fn({ tabId: 99, frameId: 0, url: 'https://example.com/x' }))
    await promise
    expect(completedListeners.length).toBe(0)
    expect(historyListeners.length).toBe(0)
    expect(removedListeners.length).toBe(0)
  })
})
