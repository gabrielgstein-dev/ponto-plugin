import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout, FetchTimeoutError, summarizeResponse } from '../../lib/domain/fetch-utils'

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

describe('summarizeResponse', () => {
  function makeRes(opts: { status: number; statusText?: string; contentType?: string | null; body: string }): Response {
    return {
      status: opts.status,
      statusText: opts.statusText ?? '',
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? (opts.contentType ?? null) : null) } as unknown as Headers,
      text: async () => opts.body,
    } as unknown as Response
  }

  it('extrai status, statusText, contentType e bodyPreview pequeno integral', async () => {
    const r = makeRes({ status: 401, statusText: 'Unauthorized', contentType: 'application/json', body: '{"err":"x"}' })
    const s = await summarizeResponse(r)
    expect(s).toEqual({
      status: 401,
      statusText: 'Unauthorized',
      contentType: 'application/json',
      bodyPreview: '{"err":"x"}',
      bodyLength: 11,
    })
  })

  it('trunca body acima de 500 chars adicionando marcador', async () => {
    const big = 'a'.repeat(750)
    const s = await summarizeResponse(makeRes({ status: 500, body: big }))
    expect(s.bodyLength).toBe(750)
    expect(s.bodyPreview!.length).toBeGreaterThan(500)
    expect(s.bodyPreview).toMatch(/…\[\+250\]$/)
  })

  it('não quebra se r.text() lançar', async () => {
    const r = {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { get: () => null } as unknown as Headers,
      text: async () => { throw new Error('boom') },
    } as unknown as Response
    const s = await summarizeResponse(r)
    expect(s.status).toBe(502)
    expect(s.bodyPreview).toContain('<read error: boom>')
    expect(s.bodyLength).toBeNull()
  })
})
