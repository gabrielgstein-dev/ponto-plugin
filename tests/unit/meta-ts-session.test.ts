/**
 * Cobre meta-ts-session.getMetaTsTokenSilently — refresh silencioso do
 * accessToken via /api/auth/session, sem dependência de aba aberta.
 *
 * Validado em produção: fetch direto do background com credentials:'include'
 * é aceito por plataforma.meta.com.br e o cookie HttpOnly de sessão é
 * enviado automaticamente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getMetaTsTokenSilently } from '../../lib/infrastructure/meta/timesheet/meta-ts-session'
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

const REAL_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzgwOTI5MzJ9.signature'

describe('getMetaTsTokenSilently', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('faz fetch para platformUrl + sessionEndpoint com credentials:include', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: REAL_TOKEN }),
    }) as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const auth = makeAuth()
    await getMetaTsTokenSilently(CONFIG, auth)

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://plataforma.meta.com.br/api/auth/session',
      { credentials: 'include' },
    )
  })

  it('extrai accessToken do top-level (sem aninhamento) e persiste', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        user: { name: 'Gabriel', email: 'g@example.com' },
        expires: '2026-05-06T19:40:29.725Z',
        accessToken: REAL_TOKEN,
      }),
    }) as Response))

    const auth = makeAuth()
    const result = await getMetaTsTokenSilently(CONFIG, auth)

    expect(result).toBe(REAL_TOKEN)
    expect(auth.saveToken).toHaveBeenCalledWith(REAL_TOKEN)
  })

  it('retorna null quando endpoint responde 401 (cookie expirado)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as Response))

    const auth = makeAuth()
    const result = await getMetaTsTokenSilently(CONFIG, auth)

    expect(result).toBeNull()
    expect(auth.saveToken).not.toHaveBeenCalled()
  })

  it('retorna null quando body não tem accessToken (sessão sem auth)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ user: null, expires: '...' }),
    }) as Response))

    const auth = makeAuth()
    const result = await getMetaTsTokenSilently(CONFIG, auth)

    expect(result).toBeNull()
    expect(auth.saveToken).not.toHaveBeenCalled()
  })

  it('retorna null quando accessToken é string muito curta (sanity check)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'short' }),
    }) as Response))

    const auth = makeAuth()
    const result = await getMetaTsTokenSilently(CONFIG, auth)

    expect(result).toBeNull()
    expect(auth.saveToken).not.toHaveBeenCalled()
  })

  it('retorna null quando fetch lança (erro de rede)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network failure')
    }))

    const auth = makeAuth()
    const result = await getMetaTsTokenSilently(CONFIG, auth)

    expect(result).toBeNull()
    expect(auth.saveToken).not.toHaveBeenCalled()
  })

  it('não chama chrome.tabs nem chrome.scripting (caminho standalone)', async () => {
    const tabsSpy = vi.fn()
    const scriptingSpy = vi.fn()
    ;(globalThis as { chrome?: unknown }).chrome = {
      tabs: { query: tabsSpy },
      scripting: { executeScript: scriptingSpy },
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: REAL_TOKEN }),
    }) as Response))

    const auth = makeAuth()
    await getMetaTsTokenSilently(CONFIG, auth)

    expect(tabsSpy).not.toHaveBeenCalled()
    expect(scriptingSpy).not.toHaveBeenCalled()
  })
})
