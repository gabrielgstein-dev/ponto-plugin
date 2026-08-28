/**
 * Migração de domínio do GP (ago/2026): o host antigo respondia 301 cego pra
 * tela de login. Antes, isso virava `r.json()` explodindo num catch genérico
 * de rede — silencioso. Agora todo fetch ao GP usa `redirect: 'manual'`,
 * detecta o redirect, loga como auth/high e marca `gpUnreachableTs` no
 * storage pra UI avisar "atualize o plugin" em vez de "reconecte".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLogError } = vi.hoisted(() => ({ mockLogError: vi.fn() }))
vi.mock('../../lib/domain/error-logger', () => ({ logError: mockLogError }))
vi.mock('../../lib/infrastructure/senior/senior-token-refresh', () => ({
  refreshSeniorTokenSilently: vi.fn().mockResolvedValue(null),
  persistSeniorTokens: vi.fn().mockResolvedValue(undefined),
}))
// Cookie saiu da cadeia de auth (feat/auto-punch-ensure-tab); o fallback
// quando o storage está vazio é a aba Senior aberta.
vi.mock('../../lib/infrastructure/senior/senior-page-auth', () => ({
  SeniorPageAuth: vi.fn().mockImplementation(() => ({ getAccessToken: vi.fn().mockResolvedValue('page-token') })),
}))

import { getGpAssertion } from '../../lib/infrastructure/insi/gestaoponto/gp-auth'
import { isGpHostRedirect } from '../../lib/infrastructure/insi/gestaoponto/gp-host-guard'
import { mockStorageGet, mockStorageSet, mockStorageRemove } from '../setup/chrome-mock'

beforeEach(() => {
  mockStorageGet.mockResolvedValue({})
  mockLogError.mockReset()
})

describe('isGpHostRedirect', () => {
  it('detecta opaqueredirect (redirect: manual no service worker)', () => {
    expect(isGpHostRedirect({ type: 'opaqueredirect', status: 0, redirected: false } as Response)).toBe(true)
  })
  it('detecta r.redirected (ambiente que seguiu o redirect)', () => {
    expect(isGpHostRedirect({ type: 'basic', status: 200, redirected: true } as Response)).toBe(true)
  })
  it('detecta 3xx explícito', () => {
    expect(isGpHostRedirect({ type: 'basic', status: 301, redirected: false } as Response)).toBe(true)
  })
  it('não confunde 401/500 com redirect', () => {
    expect(isGpHostRedirect({ type: 'basic', status: 401, redirected: false } as Response)).toBe(false)
    expect(isGpHostRedirect({ type: 'basic', status: 500, redirected: false } as Response)).toBe(false)
  })
})

describe('getGpAssertion quando o host GP redireciona', () => {
  it('usa redirect: manual, retorna null, loga auth/high e marca gpUnreachableTs', async () => {
    const fetchSpy = vi.fn(async () => ({ type: 'opaqueredirect', status: 0, redirected: false, ok: false, headers: new Headers() }) as unknown as Response)
    ;(globalThis as { fetch: typeof fetch }).fetch = fetchSpy

    const result = await getGpAssertion(true)

    expect(result).toBeNull()
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('gestaoponto.insi.com')
    expect(init.redirect).toBe('manual')
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ category: 'auth', severity: 'high', operation: 'gp.hostRedirected' }),
    )
    expect(mockStorageSet).toHaveBeenCalledWith(expect.objectContaining({ gpUnreachableTs: expect.any(Number), gpUnreachableUrl: url }))
  })

  it('limpa gpUnreachableTs quando auth/g7 volta a responder', async () => {
    mockStorageGet.mockImplementation(async (keys: unknown) => {
      const k = Array.isArray(keys) ? keys : [keys]
      return k.includes('gpUnreachableTs') ? { gpUnreachableTs: 123 } : {}
    })
    ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => ({
      type: 'basic', status: 200, ok: true, redirected: false,
      json: async () => ({ token: 'gp-jwt', colaborador: { id: '42' }, userRange: [] }),
    }) as unknown as Response)

    const result = await getGpAssertion(true)

    expect(result?.assertion).toBe('gp-jwt')
    await new Promise(r => setTimeout(r, 0))
    expect(mockStorageRemove).toHaveBeenCalledWith(['gpUnreachableTs', 'gpUnreachableUrl'])
  })
})
