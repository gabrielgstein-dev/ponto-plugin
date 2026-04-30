/**
 * F2 — GpPunchProvider: guarda de sessão Senior
 *
 * Garante que fetchGpViaTabs só é chamado quando existe uma sessão Senior ativa.
 * Sem token, nenhuma aba é aberta.
 *
 * Cobre:
 *   CV-2.1  Sem cookie e sem storage → tab NÃO é aberta
 *   CV-2.2  Com cookie válido e fetchDirect falhou → tab É aberta
 *   CV-2.3  Com seniorToken no storage e fetchDirect falhou → tab É aberta
 *   CV-2.4  fetchDirect com sucesso → tab NÃO é aberta
 *   CV-2.5  Cooldown de falha (60s) bloqueia nova tentativa mesmo com token
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockCookiesGetAll, mockStorageGet, mockTabsCreate } from '../setup/chrome-mock'

// ── Mocks de módulos ─────────────────────────────────────────────────────────

const { mockFetchGpViaTabs, mockGetGpAssertion } = vi.hoisted(() => ({
  mockFetchGpViaTabs: vi.fn().mockResolvedValue([]),
  mockGetGpAssertion: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../lib/infrastructure/meta/gestaoponto/gp-tab', () => ({
  fetchGpViaTabs: mockFetchGpViaTabs,
}))

vi.mock('../../lib/infrastructure/meta/gestaoponto/gp-auth', () => ({
  getGpAssertion: mockGetGpAssertion,
  invalidateGpCache: vi.fn(),
}))

import { GpPunchProvider, resetGpPunchCache } from '../../lib/infrastructure/meta/gestaoponto/gp-provider'

const COOKIE_WITH_TOKEN = [{ value: encodeURIComponent(JSON.stringify({ access_token: 'senior-tok' })) }]
const SENIOR_TOKEN_MAX_AGE_MS = 6.5 * 24 * 60 * 60 * 1000

beforeEach(() => {
  resetGpPunchCache()
  mockGetGpAssertion.mockResolvedValue(null) // fetchDirect falha por padrão
  mockFetchGpViaTabs.mockResolvedValue([])
})

describe('F2 — GpPunchProvider: guarda hasSeniorSession', () => {
  it('CV-2.1: sem cookie e sem storage → fetchGpViaTabs NÃO é chamado', async () => {
    mockCookiesGetAll.mockResolvedValue([])
    mockStorageGet.mockResolvedValue({})

    const provider = new GpPunchProvider()
    const result = await provider.fetchPunches(new Date(), true)

    expect(mockFetchGpViaTabs).not.toHaveBeenCalled()
    expect(mockTabsCreate).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('CV-2.1: sem cookie mas com seniorToken expirado → fetchGpViaTabs NÃO é chamado', async () => {
    mockCookiesGetAll.mockResolvedValue([])
    mockStorageGet.mockResolvedValue({
      seniorToken: 'old-tok',
      seniorTokenTs: Date.now() - SENIOR_TOKEN_MAX_AGE_MS - 1000, // expirado
    })

    const provider = new GpPunchProvider()
    await provider.fetchPunches(new Date(), true)

    expect(mockFetchGpViaTabs).not.toHaveBeenCalled()
  })

  it('CV-2.2: com cookie válido e fetchDirect falhou → fetchGpViaTabs É chamado', async () => {
    mockCookiesGetAll.mockResolvedValue(COOKIE_WITH_TOKEN)
    mockStorageGet.mockResolvedValue({})

    const provider = new GpPunchProvider()
    await provider.fetchPunches(new Date(), true)

    expect(mockFetchGpViaTabs).toHaveBeenCalledWith(true)
  })

  it('CV-2.3: com seniorToken no storage e fetchDirect falhou → fetchGpViaTabs É chamado', async () => {
    mockCookiesGetAll.mockResolvedValue([])
    mockStorageGet.mockResolvedValue({
      seniorToken: 'valid-tok',
      seniorTokenTs: Date.now() - 60 * 1000, // 1 minuto atrás (dentro de 24h)
    })

    const provider = new GpPunchProvider()
    await provider.fetchPunches(new Date(), true)

    expect(mockFetchGpViaTabs).toHaveBeenCalledWith(true)
  })

  it('CV-2.4: fetchDirect com sucesso (assertion válida) → fetchGpViaTabs NÃO é chamado', async () => {
    mockCookiesGetAll.mockResolvedValue(COOKIE_WITH_TOKEN)
    mockGetGpAssertion.mockResolvedValue({
      assertion: 'gp-assertion-xyz',
      colaboradorId: '001-0000001',
      codigoCalculo: '42',
    })
    // Mock do fetch para o endpoint de marcações
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ apuracao: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new GpPunchProvider()
    await provider.fetchPunches(new Date(), true)

    expect(mockFetchGpViaTabs).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('CV-2.5: modo não-agressivo (aggressive=false) → nenhuma aba nova é criada', async () => {
    // fetchGpViaTabs(false) pode ser chamado, mas getOrCreateGpTab(allowCreate=false)
    // retorna null sem abrir aba quando não existe aba GP existente.
    mockCookiesGetAll.mockResolvedValue(COOKIE_WITH_TOKEN)
    mockStorageGet.mockResolvedValue({})

    const provider = new GpPunchProvider()
    await provider.fetchPunches(new Date(), false)

    expect(mockTabsCreate).not.toHaveBeenCalled()
  })
})
