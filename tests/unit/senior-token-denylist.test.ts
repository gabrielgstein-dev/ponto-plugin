/**
 * Token Senior rejeitado pela plataforma não volta a circular.
 *
 * Cenário real (log de 2026-11-13): sessão revogada às 07:03, o mesmo token
 * seguiu sendo recapturado da aba Senior / relido do sessionStorage e a batida
 * das 08:02 falhou com ele ("Config falhou: 401"), depois sem token nenhum.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isSeniorTokenRejected,
  markSeniorTokenRejected,
  shouldCaptureSeniorBearer,
  SENIOR_REJECTED_TOKENS_KEY,
} from '../../lib/infrastructure/senior/senior-token-denylist'
import { resolveAccessToken, registerPunch } from '../../lib/application/register-punch'
import {
  SeniorActiveUserPunchProvider,
  resetSeniorActiveUserCache,
} from '../../lib/infrastructure/senior/senior-active-user-provider'
import { SeniorPageAuth } from '../../lib/infrastructure/senior/senior-page-auth'
import {
  mockStorageGet,
  mockStorageSet,
  mockStorageRemove,
  mockTabsQuery,
  mockScriptingExecuteScript,
} from '../setup/chrome-mock'
import type { IAuthProvider, IPunchRegistrar } from '../../lib/domain/interfaces'

const DEAD = 'dead-token-9UYG1q4g-xxxxxxxxxxxxxxxx'
const ALIVE = 'alive-token-ABCDEFGH-yyyyyyyyyyyyyyyy'

// Storage em memória: os helpers do módulo leem o que gravaram.
let store: Record<string, unknown>
beforeEach(() => {
  store = {}
  mockStorageGet.mockImplementation(async (keys?: string | string[]) => {
    const ks = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys]
    return Object.fromEntries(ks.filter(k => k in store).map(k => [k, store[k]]))
  })
  mockStorageSet.mockImplementation(async (obj: Record<string, unknown>) => { Object.assign(store, obj) })
  mockStorageRemove.mockImplementation(async (keys: string | string[]) => {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k]
  })
})
afterEach(() => {
  mockStorageGet.mockReset().mockResolvedValue({})
  mockStorageSet.mockReset().mockResolvedValue(undefined)
  mockStorageRemove.mockReset().mockResolvedValue(undefined)
})

describe('denylist de token Senior', () => {
  it('token marcado passa a ser reconhecido como rejeitado; outros não', async () => {
    await markSeniorTokenRejected(DEAD, 'teste')
    expect(await isSeniorTokenRejected(DEAD)).toBe(true)
    expect(await isSeniorTokenRejected(ALIVE)).toBe(false)
    expect(await isSeniorTokenRejected(null)).toBe(false)
  })

  it('tira o token morto de seniorToken e seniorBearerToken', async () => {
    store = { seniorToken: DEAD, seniorTokenTs: 1, seniorBearerToken: DEAD, seniorBearerTs: 1 }
    await markSeniorTokenRejected(DEAD, 'teste')
    expect(store).not.toHaveProperty('seniorToken')
    expect(store).not.toHaveProperty('seniorTokenTs')
    expect(store).not.toHaveProperty('seniorBearerToken')
    expect(store).not.toHaveProperty('seniorBearerTs')
  })

  it('NÃO apaga um token novo capturado nesse meio-tempo', async () => {
    store = { seniorToken: ALIVE, seniorTokenTs: 1 }
    await markSeniorTokenRejected(DEAD, 'teste')
    expect(store.seniorToken).toBe(ALIVE)
  })

  it('entrada expira em 24h', async () => {
    store = { [SENIOR_REJECTED_TOKENS_KEY]: [{ token: DEAD, ts: Date.now() - 25 * 3600_000 }] }
    expect(await isSeniorTokenRejected(DEAD)).toBe(false)
  })

  it('guarda no máximo 20 tokens (descarta os mais antigos)', async () => {
    for (let i = 0; i < 25; i++) await markSeniorTokenRejected(`tok-${i}-zzzzzzzzzzzzzzzzzzzz`, 'teste')
    const list = store[SENIOR_REJECTED_TOKENS_KEY] as Array<{ token: string }>
    expect(list).toHaveLength(20)
    expect(await isSeniorTokenRejected('tok-0-zzzzzzzzzzzzzzzzzzzz')).toBe(false)
    expect(await isSeniorTokenRejected('tok-24-zzzzzzzzzzzzzzzzzzzz')).toBe(true)
  })
})

describe('captura via webRequest (shouldCaptureSeniorBearer)', () => {
  it('ignora requisições feitas pela própria extensão', async () => {
    expect(await shouldCaptureSeniorBearer(ALIVE, 'chrome-extension://abc')).toBe(false)
  })

  it('ignora token já rejeitado vindo da aba Senior', async () => {
    await markSeniorTokenRejected(DEAD, 'teste')
    expect(await shouldCaptureSeniorBearer(DEAD, 'https://platform.senior.com.br')).toBe(false)
  })

  it('aceita token novo vindo da aba Senior (inclusive sem initiator)', async () => {
    await markSeniorTokenRejected(DEAD, 'teste')
    expect(await shouldCaptureSeniorBearer(ALIVE, 'https://platform.senior.com.br')).toBe(true)
    expect(await shouldCaptureSeniorBearer(ALIVE, undefined)).toBe(true)
  })
})

describe('cadeia de auth da batida', () => {
  const provider = (name: string, token: string | null): IAuthProvider => ({
    name,
    getAccessToken: vi.fn(async () => token),
  })

  it('resolveAccessToken pula token rejeitado e usa o próximo provider', async () => {
    await markSeniorTokenRejected(DEAD, 'teste')
    const token = await resolveAccessToken([provider('pageContext', DEAD), provider('tokenStorage', ALIVE)])
    expect(token).toBe(ALIVE)
  })

  it('resolveAccessToken devolve null se o único token disponível foi rejeitado', async () => {
    await markSeniorTokenRejected(DEAD, 'teste')
    expect(await resolveAccessToken([provider('pageContext', DEAD)])).toBeNull()
  })

  const registrarWith = (logs: string[]): IPunchRegistrar => ({
    registerPunch: vi.fn(async () => ({ success: false, logs })),
  })

  it('"Config falhou: 401" marca o token usado como rejeitado', async () => {
    await registerPunch([provider('tokenStorage', DEAD)], registrarWith(['Buscando config do colaborador...', 'Config falhou: 401']))
    expect(await isSeniorTokenRejected(DEAD)).toBe(true)
  })

  it('"Config falhou: 403" NÃO marca (403 é escopo, não token morto)', async () => {
    await registerPunch([provider('tokenStorage', DEAD)], registrarWith(['Config falhou: 403']))
    expect(await isSeniorTokenRejected(DEAD)).toBe(false)
  })

  it('falha por outro motivo NÃO marca', async () => {
    await registerPunch([provider('tokenStorage', DEAD)], registrarWith(['Config erro: Failed to fetch']))
    expect(await isSeniorTokenRejected(DEAD)).toBe(false)
  })
})

describe('SeniorActiveUserPunchProvider', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => resetSeniorActiveUserCache())
  afterEach(() => { globalThis.fetch = originalFetch })

  const fetchWith = (status: number) => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status, statusText: 'x', json: async () => ({}) })) as unknown as typeof fetch
  }

  it('401 do bridge marca o token e o remove do storage', async () => {
    store = { seniorToken: DEAD, seniorTokenTs: Date.now() }
    fetchWith(401)
    const probe = await new SeniorActiveUserPunchProvider().probe(new Date())
    expect(probe.outcome).toBe('unavailable')
    expect(await isSeniorTokenRejected(DEAD)).toBe(true)
    expect(store).not.toHaveProperty('seniorToken')
  })

  it('403 NÃO marca o token', async () => {
    store = { seniorToken: DEAD, seniorTokenTs: Date.now() }
    fetchWith(403)
    await new SeniorActiveUserPunchProvider().probe(new Date())
    expect(await isSeniorTokenRejected(DEAD)).toBe(false)
    expect(store.seniorToken).toBe(DEAD)
  })
})

describe('SeniorPageAuth', () => {
  it('pula o token rejeitado do sessionStorage e devolve o próximo candidato', async () => {
    await markSeniorTokenRejected(DEAD, 'teste')
    mockTabsQuery.mockResolvedValue([{ id: 5, url: 'https://platform.senior.com.br/senior-x/' }])
    mockScriptingExecuteScript.mockResolvedValue([{
      result: {
        [`SS:${DEAD}-HCM`]: JSON.stringify({ expires: '2999-01-01', payload: { token: DEAD } }),
        'SS:outro': JSON.stringify({ access_token: ALIVE }),
      },
    }])
    expect(await new SeniorPageAuth().getAccessToken()).toBe(ALIVE)
  })

  it('devolve null quando o único token da aba foi rejeitado', async () => {
    await markSeniorTokenRejected(DEAD, 'teste')
    mockTabsQuery.mockResolvedValue([{ id: 5, url: 'https://platform.senior.com.br/senior-x/' }])
    mockScriptingExecuteScript.mockResolvedValue([{
      result: { [`SS:${DEAD}-HCM`]: JSON.stringify({ expires: '2999-01-01', payload: { token: DEAD } }) },
    }])
    expect(await new SeniorPageAuth().getAccessToken()).toBeNull()
  })
})
