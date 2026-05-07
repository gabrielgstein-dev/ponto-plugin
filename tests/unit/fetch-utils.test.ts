import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout, FetchTimeoutError } from '../../lib/domain/fetch-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fetchWithTimeout', () => {
  it('retorna response quando completa antes do timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 }) as Response))
    const r = await fetchWithTimeout('https://example.com', { timeoutMs: 1000 })
    expect(r.ok).toBe(true)
  })

  it('lança FetchTimeoutError quando estoura o timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const e = new Error('aborted')
        ;(e as Error & { name: string }).name = 'AbortError'
        reject(e)
      })
    })))

    vi.useFakeTimers()
    const promise = fetchWithTimeout('https://example.com', { timeoutMs: 100 })
    promise.catch(() => { /* prevent unhandled rejection */ })
    await vi.advanceTimersByTimeAsync(150)
    await expect(promise).rejects.toThrow(FetchTimeoutError)
  })

  it('FetchTimeoutError carrega o timeoutMs', async () => {
    vi.stubGlobal('fetch', vi.fn((_, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const e = new Error('aborted')
        ;(e as Error & { name: string }).name = 'AbortError'
        reject(e)
      })
    })))

    vi.useFakeTimers()
    const promise = fetchWithTimeout('https://example.com', { timeoutMs: 250 })
    promise.catch(() => { /* prevent unhandled rejection — assertion abaixo confirma o erro */ })
    await vi.advanceTimersByTimeAsync(300)
    await expect(promise).rejects.toBeInstanceOf(FetchTimeoutError)
    await expect(promise).rejects.toMatchObject({ timeoutMs: 250 })
  })

  it('propaga AbortError externo sem virar FetchTimeoutError', async () => {
    vi.stubGlobal('fetch', vi.fn((_, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const e = new Error('aborted')
        ;(e as Error & { name: string }).name = 'AbortError'
        reject(e)
      })
    })))

    const externalCtrl = new AbortController()
    const promise = fetchWithTimeout('https://example.com', {
      timeoutMs: 5000,
      signal: externalCtrl.signal,
    })
    externalCtrl.abort()
    await expect(promise).rejects.toThrow(/aborted/)
    await expect(promise).rejects.not.toBeInstanceOf(FetchTimeoutError)
  })

  it('default de 5000ms quando timeoutMs não passado', async () => {
    let receivedSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn(async (_, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined
      return { ok: true, status: 200 } as Response
    }))
    await fetchWithTimeout('https://example.com')
    expect(receivedSignal).toBeDefined()
  })
})
