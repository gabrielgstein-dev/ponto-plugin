/**
 * Cobre meta-ts-session.getMetaTsTokenSilently — refresh silencioso direto
 * do background, sem aba aberta. Validado em produção: fetch direto com
 * credentials:'include' aceita extension origin em plataforma.meta.com.br.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { TimesheetConfig } from '../../lib/infrastructure/timesheet/timesheet-config'
import type { TimesheetAuth } from '../../lib/infrastructure/timesheet/timesheet-auth'

const CONFIG: TimesheetConfig = {
  name: 'meta-ts',
  apiUrl: 'https://api.meta.com.br',
  platformUrl: 'https://plataforma.meta.com.br',
  sessionEndpoint: '/api/auth/session',
  timesheetsBase: '/timesheets/v1',
  tokenMaxAgeMs: 60_000,
  storagePrefix: 'metaTs',
  jwtUuidField: 'metaUUID',
}

function makeAuth(): TimesheetAuth & { saveToken: ReturnType<typeof vi.fn> } {
  return {
    getToken: vi.fn(),
    getUserId: vi.fn(),
    saveToken: vi.fn(),
    clearToken: vi.fn(),
  } as unknown as TimesheetAuth & { saveToken: ReturnType<typeof vi.fn> }
}

// JWT real-ish com exp futuro pra passar o isValidJWT
function makeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '')
  const exp = Math.floor(Date.now() / 1000) + 600
  const body = btoa(JSON.stringify({ exp, sub: 'user' })).replace(/=/g, '')
  return `${header}.${body}.signature`
}

describe('getMetaTsTokenSilently', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.doMock('../../lib/domain/build-flags', () => ({
      ENABLE_SILENT_REFRESH: true,
      DEBUG: false,
      ENABLE_SENIOR_INTEGRATION: true,
      ENABLE_META_TIMESHEET: true,
    }))
    const mod = await import('../../lib/infrastructure/meta/timesheet/meta-ts-session')
    mod._resetForTests()
  })

  it('é no-op quando ENABLE_SILENT_REFRESH=false', async () => {
    vi.resetModules()
    vi.doMock('../../lib/domain/build-flags', () => ({
      ENABLE_SILENT_REFRESH: false,
      DEBUG: false,
      ENABLE_SENIOR_INTEGRATION: true,
      ENABLE_META_TIMESHEET: true,
    }))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { getMetaTsTokenSilently } = await import(
      '../../lib/infrastructure/meta/timesheet/meta-ts-session'
    )
    const auth = makeAuth()
    const result = await getMetaTsTokenSilently(CONFIG, auth)
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(auth.saveToken).not.toHaveBeenCalled()
  })

  it('faz fetch direto pra platformUrl + sessionEndpoint com credentials:include', async () => {
    const jwt = makeJwt()
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: jwt }),
    }) as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const { getMetaTsTokenSilently } = await import(
      '../../lib/infrastructure/meta/timesheet/meta-ts-session'
    )
    const auth = makeAuth()
    await getMetaTsTokenSilently(CONFIG, auth)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://plataforma.meta.com.br/api/auth/session')
    expect((init as RequestInit).credentials).toBe('include')
  })

  it('persiste o accessToken JWT válido', async () => {
    const jwt = makeJwt()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: jwt }),
    }) as Response))

    const { getMetaTsTokenSilently } = await import(
      '../../lib/infrastructure/meta/timesheet/meta-ts-session'
    )
    const auth = makeAuth()
    const result = await getMetaTsTokenSilently(CONFIG, auth)

    expect(result).toBe(jwt)
    expect(auth.saveToken).toHaveBeenCalledWith(jwt)
  })

  it('rejeita JWT expirado (não persiste)', async () => {
    // exp passado
    const header = btoa(JSON.stringify({ alg: 'RS256' })).replace(/=/g, '')
    const body = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 100 })).replace(/=/g, '')
    const expiredJwt = `${header}.${body}.sig`
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: expiredJwt }),
    }) as Response))

    const { getMetaTsTokenSilently } = await import(
      '../../lib/infrastructure/meta/timesheet/meta-ts-session'
    )
    const auth = makeAuth()
    expect(await getMetaTsTokenSilently(CONFIG, auth)).toBeNull()
    expect(auth.saveToken).not.toHaveBeenCalled()
  })

  it('retorna null com 401 (cookie expirado)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as Response))

    const { getMetaTsTokenSilently } = await import(
      '../../lib/infrastructure/meta/timesheet/meta-ts-session'
    )
    const auth = makeAuth()
    expect(await getMetaTsTokenSilently(CONFIG, auth)).toBeNull()
  })

  it('chamadas paralelas compartilham a mesma Promise (single-flight)', async () => {
    const jwt = makeJwt()
    let fetchCalls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCalls++
      await new Promise(r => setTimeout(r, 10))
      return { ok: true, status: 200, json: async () => ({ accessToken: jwt }) } as Response
    }))

    const { getMetaTsTokenSilently } = await import(
      '../../lib/infrastructure/meta/timesheet/meta-ts-session'
    )
    const auth = makeAuth()
    const [r1, r2, r3] = await Promise.all([
      getMetaTsTokenSilently(CONFIG, auth),
      getMetaTsTokenSilently(CONFIG, auth),
      getMetaTsTokenSilently(CONFIG, auth),
    ])
    expect(r1).toBe(jwt)
    expect(r2).toBe(jwt)
    expect(r3).toBe(jwt)
    expect(fetchCalls).toBe(1)
  })

  it('retorna null quando fetch lança (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Failed to fetch')
    }))

    const { getMetaTsTokenSilently } = await import(
      '../../lib/infrastructure/meta/timesheet/meta-ts-session'
    )
    const auth = makeAuth()
    expect(await getMetaTsTokenSilently(CONFIG, auth)).toBeNull()
    expect(auth.saveToken).not.toHaveBeenCalled()
  })
})
