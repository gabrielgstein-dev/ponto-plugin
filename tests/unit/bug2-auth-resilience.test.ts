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

describe('refreshSeniorTokenSilently — contrato real + proteções', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.doUnmock('../../lib/infrastructure/senior/senior-token-refresh')
    vi.doMock('../../lib/domain/build-flags', () => ({
      ENABLE_SILENT_REFRESH: true,
      DEBUG: false,
      ENABLE_SENIOR_INTEGRATION: true,
      ENABLE_META_TIMESHEET: true,
    }))
    const mod = await import('../../lib/infrastructure/senior/senior-token-refresh')
    mod._resetForTests()
  })

  it('é no-op quando ENABLE_SILENT_REFRESH=false', async () => {
    vi.resetModules()
    vi.doUnmock('../../lib/infrastructure/senior/senior-token-refresh')
    vi.doMock('../../lib/domain/build-flags', () => ({
      ENABLE_SILENT_REFRESH: false,
      DEBUG: false,
      ENABLE_SENIOR_INTEGRATION: true,
      ENABLE_META_TIMESHEET: true,
    }))
    mockStorageGet.mockResolvedValue({ seniorRefreshToken: 'rt-xyz' })
    const fetchSpy = vi.fn()
    ;(globalThis as { fetch: typeof fetch }).fetch = fetchSpy

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    const result = await refreshSeniorTokenSilently()
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('envia { refreshToken } no body (não { token })', async () => {
    mockStorageGet.mockResolvedValue({ seniorRefreshToken: 'rt-xyz' })
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        jsonToken: JSON.stringify({ access_token: 'a', refresh_token: 'b' }),
      }),
    }) as Response)
    ;(globalThis as { fetch: typeof fetch }).fetch = fetchSpy

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    await refreshSeniorTokenSilently()

    const [, init] = fetchSpy.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ refreshToken: 'rt-xyz' })
  })

  it('extrai access_token de jsonToken aninhado e persiste', async () => {
    mockStorageGet.mockResolvedValue({ seniorRefreshToken: 'rt-old' })
    ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        jsonToken: JSON.stringify({
          version: 1,
          expires_in: 604800,
          access_token: 'new-access',
          refresh_token: 'rt-new',
        }),
      }),
    }) as Response)

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    const result = await refreshSeniorTokenSilently()

    expect(result).toBe('new-access')
    const setKeys = mockStorageSet.mock.calls.flatMap(c => Object.entries(c[0] ?? {}))
    expect(setKeys).toContainEqual(['seniorToken', 'new-access'])
    expect(setKeys).toContainEqual(['seniorRefreshToken', 'rt-new'])
  })

  it('chamadas paralelas compartilham a mesma Promise (single-flight)', async () => {
    mockStorageGet.mockResolvedValue({ seniorRefreshToken: 'rt-xyz' })
    let fetchCalls = 0
    ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => {
      fetchCalls++
      // Pequeno delay pra garantir que paralelas se sobrepõem
      await new Promise(r => setTimeout(r, 10))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonToken: JSON.stringify({ access_token: 'a', refresh_token: 'b' }),
        }),
      } as Response
    })

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    const [r1, r2, r3] = await Promise.all([
      refreshSeniorTokenSilently(),
      refreshSeniorTokenSilently(),
      refreshSeniorTokenSilently(),
    ])

    expect(r1).toBe('a')
    expect(r2).toBe('a')
    expect(r3).toBe('a')
    expect(fetchCalls).toBe(1) // só 1 fetch real, mesmo com 3 callers
  })

  it('circuit breaker abre após 3 falhas em 30s', async () => {
    mockStorageGet.mockResolvedValue({ seniorRefreshToken: 'rt-xyz' })
    let fetchCalls = 0
    ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => {
      fetchCalls++
      return { ok: false, status: 500, text: async () => 'err', json: async () => ({}) } as Response
    })

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    await refreshSeniorTokenSilently()
    await refreshSeniorTokenSilently()
    await refreshSeniorTokenSilently()
    expect(fetchCalls).toBe(3)

    // 4ª chamada: circuito aberto, não chama fetch
    const r4 = await refreshSeniorTokenSilently()
    expect(r4).toBeNull()
    expect(fetchCalls).toBe(3)
  })

  it('retorna null quando endpoint responde 400 (sem propagar exception)', async () => {
    mockStorageGet.mockResolvedValue({ seniorRefreshToken: 'rt-xyz' })
    ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => '{"message":"refreshToken is required"}',
      json: async () => ({}),
    }) as Response)

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    expect(await refreshSeniorTokenSilently()).toBeNull()
  })

  it('retorna null quando body não tem jsonToken válido', async () => {
    mockStorageGet.mockResolvedValue({ seniorRefreshToken: 'rt-xyz' })
    ;(globalThis as { fetch: typeof fetch }).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: 'shape' }),
    }) as Response)

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    expect(await refreshSeniorTokenSilently()).toBeNull()
  })

  it('retorna null sem fetch quando não há refresh_token no storage', async () => {
    mockStorageGet.mockResolvedValue({})
    const fetchSpy = vi.fn()
    ;(globalThis as { fetch: typeof fetch }).fetch = fetchSpy

    const { refreshSeniorTokenSilently } = await import(
      '../../lib/infrastructure/senior/senior-token-refresh'
    )
    expect(await refreshSeniorTokenSilently()).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
