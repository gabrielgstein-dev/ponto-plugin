/**
 * F4 — Garantir sincronização de token com o Senior
 *
 * Cobre os critérios:
 *   CV-4.3  SeniorInterceptorAuth respeita TTL de 60 minutos
 *   CV-4.4  Fallback entre fontes de token (interceptor → page → storage)
 *   CV-4.5  SeniorPageAuth extrai JWT de sessionStorage/localStorage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { SeniorInterceptorAuth } from '../../lib/infrastructure/senior/senior-interceptor-auth'
import { SeniorPageAuth } from '../../lib/infrastructure/senior/senior-page-auth'
import {
  mockStorageGet,
  mockTabsQuery,
  mockScriptingExecuteScript,
} from '../setup/chrome-mock'

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
