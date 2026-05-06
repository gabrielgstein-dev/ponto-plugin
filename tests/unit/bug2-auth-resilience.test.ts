/**
 * BUG 2 — gp-auth resilience after 401/403.
 *
 * Antes: ao receber 401/403 do GP API, gp-auth chamava
 * invalidateSeniorTokenStorage() que removia seniorToken/seniorTokenTs do
 * storage. Como storage é fallback do cookie, isso podia deixar o usuário
 * num estado onde o cookie expirou + storage limpo = sem auth, sem fallback.
 *
 * Agora:
 *  - 401/403 NÃO toca seniorToken no storage
 *  - 401/403 dispara refreshSeniorTokenSilently({force: true}) (sem o
 *    threshold de 12h) e tenta de novo com o token renovado
 *  - Se ainda assim falhar, retorna null em silêncio — o sidepanel detecta
 *    e mostra UI de "Reconectar" pro usuário
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSeniorRefresh } = vi.hoisted(() => ({
  mockSeniorRefresh: vi.fn<[{ force?: boolean }?], Promise<string | null>>(),
}))

vi.mock('../../lib/infrastructure/senior/senior-token-refresh', () => ({
  refreshSeniorTokenSilently: mockSeniorRefresh,
  persistSeniorTokens: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/infrastructure/senior/senior-cookie-auth', () => ({
  SeniorCookieAuth: vi.fn().mockImplementation(() => ({
    getAccessToken: vi.fn().mockResolvedValue('cookie-token'),
  })),
}))

vi.mock('../../lib/infrastructure/senior/senior-page-auth', () => ({
  SeniorPageAuth: vi.fn().mockImplementation(() => ({
    getAccessToken: vi.fn().mockResolvedValue(null),
  })),
}))

import { getGpAssertion } from '../../lib/infrastructure/meta/gestaoponto/gp-auth'
import { mockStorageGet, mockStorageRemove, mockStorageSet } from '../setup/chrome-mock'

beforeEach(() => {
  mockStorageGet.mockResolvedValue({}) // sem cache de gpAssertion
  mockSeniorRefresh.mockReset().mockResolvedValue(null)
})

function mockGpAuthFetch(responses: Array<{ status: number; body?: unknown }>): void {
  let i = 0
  ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)]
    i++
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    } as Response
  })
}

describe('BUG 2 — getGpAssertion ao receber 401/403', () => {
  it('NÃO chama storage.local.remove(["seniorToken"]) — preserva fallback', async () => {
    mockGpAuthFetch([{ status: 401 }, { status: 401 }])
    mockSeniorRefresh.mockResolvedValueOnce(null) // refresh também falha

    await getGpAssertion(true)

    // Confirma: nenhuma chamada de remove com seniorToken
    const removeCalls = mockStorageRemove.mock.calls.flatMap(c => {
      const arg = c[0]
      return Array.isArray(arg) ? arg : [arg]
    })
    expect(removeCalls).not.toContain('seniorToken')
    expect(removeCalls).not.toContain('seniorTokenTs')
  })

  it('tenta refreshSeniorTokenSilently({force: true}) ao receber 401', async () => {
    mockGpAuthFetch([{ status: 401 }, { status: 401 }])
    mockSeniorRefresh.mockResolvedValueOnce(null)

    await getGpAssertion(true)

    expect(mockSeniorRefresh).toHaveBeenCalledWith({ force: true })
  })

  it('refaz a chamada com o token renovado e retorna sucesso', async () => {
    mockGpAuthFetch([
      { status: 401 }, // 1ª tentativa: cookie-token rejeitado
      { status: 200, body: { token: 'gp-jwt', colaborador: { id: '42' }, userRange: [] } }, // 2ª: refresh-token aceito
    ])
    mockSeniorRefresh.mockResolvedValueOnce('refreshed-senior-token')

    const result = await getGpAssertion(true)

    expect(result).not.toBeNull()
    expect(result?.assertion).toBe('gp-jwt')
    expect(result?.colaboradorId).toBe('42')
    expect(mockSeniorRefresh).toHaveBeenCalledWith({ force: true })
  })

  it('retorna null em silêncio quando refresh também falha (cache stale, sem invalidar)', async () => {
    mockGpAuthFetch([{ status: 403 }])
    mockSeniorRefresh.mockResolvedValueOnce(null)

    const result = await getGpAssertion(true)
    expect(result).toBeNull()

    // Storage não foi tocado — fallback preservado pra próxima tentativa
    const removeCalls = mockStorageRemove.mock.calls.flatMap(c => {
      const arg = c[0]
      return Array.isArray(arg) ? arg : [arg]
    })
    expect(removeCalls).not.toContain('seniorToken')
  })

  it('NÃO tenta refresh quando GP responde sucesso na 1ª tentativa', async () => {
    mockGpAuthFetch([
      { status: 200, body: { token: 'gp-jwt', colaborador: { id: '7' }, userRange: [] } },
    ])

    const result = await getGpAssertion(true)

    expect(result?.assertion).toBe('gp-jwt')
    expect(mockSeniorRefresh).not.toHaveBeenCalled()
    // Storage.set foi chamado com gpAssertion
    const setKeys = mockStorageSet.mock.calls.map(c => Object.keys(c[0] ?? {})).flat()
    expect(setKeys).toContain('gpAssertion')
  })

  it('NÃO tenta refresh em erros não-401/403 (ex: 500, network)', async () => {
    mockGpAuthFetch([{ status: 500 }])

    const result = await getGpAssertion(true)
    expect(result).toBeNull()
    expect(mockSeniorRefresh).not.toHaveBeenCalled()
  })
})

describe('BUG 2 — refreshSeniorTokenSilently com force:true (re-import direto)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../../lib/infrastructure/senior/senior-token-refresh')
  })

  it('com force:true, ignora o threshold de 12h e tenta refresh imediato', async () => {
    // Token recém-criado (idade=0, restaria muito mais que 12h)
    mockStorageGet.mockResolvedValue({
      seniorRefreshToken: 'rt-xyz',
      seniorTokenTs: Date.now(),
    })
    ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new-token', refresh_token: 'rt-xyz' }),
    }) as Response)

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    const result = await refreshSeniorTokenSilently({ force: true })
    expect(result).toBe('new-token')
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('sem force, com token recém-criado, pula refresh (preventivo)', async () => {
    mockStorageGet.mockResolvedValue({
      seniorRefreshToken: 'rt-xyz',
      seniorTokenTs: Date.now(),
    })
    ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn()

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    const result = await refreshSeniorTokenSilently()
    expect(result).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
