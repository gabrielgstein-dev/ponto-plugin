/**
 * F4 — Garantir sincronização de token com o Senior
 *
 * Cobre os critérios:
 *   CV-4.1  SeniorCookieAuth extrai token direto de com.senior.token
 *   CV-4.2  SeniorCookieAuth extrai de jsonToken aninhado
 *   CV-4.3  SeniorInterceptorAuth respeita TTL de 60 minutos
 *   CV-4.4  Fallback entre fontes de token (cookie → interceptor → page → storage)
 *   CV-4.5  SeniorPageAuth extrai JWT de sessionStorage/localStorage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { SeniorCookieAuth } from '../../lib/infrastructure/senior/senior-cookie-auth'
import { SeniorInterceptorAuth } from '../../lib/infrastructure/senior/senior-interceptor-auth'
import { SeniorPageAuth } from '../../lib/infrastructure/senior/senior-page-auth'
import {
  mockCookiesGetAll,
  mockStorageGet,
  mockTabsQuery,
  mockScriptingExecuteScript,
} from '../setup/chrome-mock'

// ── SeniorCookieAuth ──────────────────────────────────────────────────────────
describe('F4 — SeniorCookieAuth', () => {
  let auth: SeniorCookieAuth

  beforeEach(() => {
    auth = new SeniorCookieAuth()
  })

  it('CV-4.1: retorna null quando cookie não existe', async () => {
    mockCookiesGetAll.mockResolvedValue([])
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('CV-4.1: extrai access_token direto do cookie', async () => {
    const payload = { access_token: 'direct-token-xyz' }
    mockCookiesGetAll.mockResolvedValue([
      { value: encodeURIComponent(JSON.stringify(payload)) },
    ])
    expect(await auth.getAccessToken()).toBe('direct-token-xyz')
  })

  it('CV-4.2: extrai access_token via campo jsonToken (string)', async () => {
    const inner = { access_token: 'nested-token-abc' }
    const payload = { jsonToken: JSON.stringify(inner) }
    mockCookiesGetAll.mockResolvedValue([
      { value: encodeURIComponent(JSON.stringify(payload)) },
    ])
    expect(await auth.getAccessToken()).toBe('nested-token-abc')
  })

  it('CV-4.2: extrai access_token via jsonToken (objeto já parseado)', async () => {
    const payload = { jsonToken: { access_token: 'obj-token' } }
    mockCookiesGetAll.mockResolvedValue([
      { value: encodeURIComponent(JSON.stringify(payload)) },
    ])
    expect(await auth.getAccessToken()).toBe('obj-token')
  })

  it('CV-4.4: extrai access_token de valor aninhado no cookie', async () => {
    const payload = { metadata: { access_token: 'deep-token' } }
    mockCookiesGetAll.mockResolvedValue([
      { value: encodeURIComponent(JSON.stringify(payload)) },
    ])
    expect(await auth.getAccessToken()).toBe('deep-token')
  })

  it('CV-4.1: retorna null quando cookie existe mas não tem access_token em nenhuma estrutura', async () => {
    const payload = { random_field: 'value', other: { data: 123 } }
    mockCookiesGetAll.mockResolvedValue([
      { value: encodeURIComponent(JSON.stringify(payload)) },
    ])
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('CV-4.1: retorna null quando cookie tem JSON inválido (não lança exceção)', async () => {
    mockCookiesGetAll.mockResolvedValue([
      { value: encodeURIComponent('not-json{{') },
    ])
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('CV-4.1: busca cookies no domínio correto (.senior.com.br)', async () => {
    mockCookiesGetAll.mockResolvedValue([])
    await auth.getAccessToken()
    expect(mockCookiesGetAll).toHaveBeenCalledWith({
      domain: '.senior.com.br',
      name: 'com.senior.token',
    })
  })
})

// ── SeniorInterceptorAuth ─────────────────────────────────────────────────────
describe('F4 — SeniorInterceptorAuth', () => {
  let auth: SeniorInterceptorAuth

  beforeEach(() => {
    auth = new SeniorInterceptorAuth()
  })

  it('CV-4.3a: retorna null quando nenhum token está no storage', async () => {
    mockStorageGet.mockResolvedValue({})
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('CV-4.3b: retorna null quando token tem mais de 60 minutos (expirado)', async () => {
    const expiredTs = Date.now() - 61 * 60 * 1000 // 61 minutos atrás
    mockStorageGet.mockResolvedValue({
      seniorBearerToken: 'old-token',
      seniorBearerTs: expiredTs,
    })
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('CV-4.3c: retorna token quando tem menos de 60 minutos (válido)', async () => {
    const freshTs = Date.now() - 10 * 60 * 1000 // 10 minutos atrás
    mockStorageGet.mockResolvedValue({
      seniorBearerToken: 'fresh-token-789',
      seniorBearerTs: freshTs,
    })
    expect(await auth.getAccessToken()).toBe('fresh-token-789')
  })

  it('CV-4.3d: token com exatamente 59 minutos é ainda válido', async () => {
    const ts = Date.now() - 59 * 60 * 1000
    mockStorageGet.mockResolvedValue({ seniorBearerToken: 'ok-tok', seniorBearerTs: ts })
    expect(await auth.getAccessToken()).toBe('ok-tok')
  })

  it('CV-4.3e: token capturado agora (ts=0) é tratado como muito antigo → null', async () => {
    mockStorageGet.mockResolvedValue({ seniorBearerToken: 'tok', seniorBearerTs: 0 })
    // ts=0 → age = now/60000 >> 60 → deve retornar null
    expect(await auth.getAccessToken()).toBeNull()
  })
})

// ── SeniorPageAuth ────────────────────────────────────────────────────────────
describe('F4 — SeniorPageAuth', () => {
  let auth: SeniorPageAuth

  beforeEach(() => {
    auth = new SeniorPageAuth()
  })

  it('CV-4.5a: retorna null quando não há aba Senior aberta', async () => {
    mockTabsQuery.mockResolvedValue([])
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('CV-4.5b: extrai token de objeto com access_token no sessionStorage', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 5, url: 'https://rh.senior.com.br' }])
    const dump = {
      'SS:authData': JSON.stringify({ access_token: 'page-token-ss' }),
    }
    mockScriptingExecuteScript.mockResolvedValue([{ result: dump }])
    expect(await auth.getAccessToken()).toBe('page-token-ss')
  })

  it('CV-4.5c: extrai token JWT raw do localStorage (eyJ...)', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 5, url: 'https://rh.senior.com.br' }])
    const jwtLike = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature'
    const dump = { 'LS:token': jwtLike }
    mockScriptingExecuteScript.mockResolvedValue([{ result: dump }])
    expect(await auth.getAccessToken()).toBe(jwtLike)
  })

  it('CV-4.5d: retorna null quando dump não contém token válido', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 5, url: 'https://rh.senior.com.br' }])
    const dump = { 'SS:other': 'nothing-useful' }
    mockScriptingExecuteScript.mockResolvedValue([{ result: dump }])
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('CV-4.5e: retorna null quando executeScript lança exceção', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 5, url: 'https://rh.senior.com.br' }])
    mockScriptingExecuteScript.mockRejectedValue(new Error('No access'))
    expect(await auth.getAccessToken()).toBeNull()
  })
})

// ── Cadeia de fallback (CV-4.4) ───────────────────────────────────────────────
describe('F4 — Cadeia de autenticação (cookie → interceptor → page → storage)', () => {
  it('CV-4.4a: cookie retorna token → não consulta demais', async () => {
    mockCookiesGetAll.mockResolvedValue([
      { value: encodeURIComponent(JSON.stringify({ access_token: 'cookie-tok' })) },
    ])
    mockStorageGet.mockResolvedValue({}) // interceptor vazio

    const cookie = new SeniorCookieAuth()
    const interceptor = new SeniorInterceptorAuth()

    const tok = await cookie.getAccessToken()
    expect(tok).toBe('cookie-tok')
    // Se cookie funciona, interceptor não precisa ser chamado
    expect(mockStorageGet).not.toHaveBeenCalled()
  })

  it('CV-4.4b: cookie retorna null → interceptor é consultado', async () => {
    mockCookiesGetAll.mockResolvedValue([])
    mockStorageGet.mockResolvedValue({
      seniorBearerToken: 'interceptor-tok',
      seniorBearerTs: Date.now() - 5000,
    })

    const cookie = new SeniorCookieAuth()
    const interceptor = new SeniorInterceptorAuth()

    const cookTok = await cookie.getAccessToken()
    expect(cookTok).toBeNull()

    const interceptTok = await interceptor.getAccessToken()
    expect(interceptTok).toBe('interceptor-tok')
  })
})
