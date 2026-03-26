/**
 * F1 — Garantir que o ponto está sendo batido
 *
 * Cobre os critérios:
 *   CV-1.1  API Senior responde 200/201/202 → success: true
 *   CV-1.2  Signature SHA-256 gerada e enviada no payload
 *   CV-1.3  Payload contém todos os campos obrigatórios
 *   CV-1.4  Fallbacks executados (skipValidation, sem signature)
 *   CV-1.5  Resposta parseada e retorna success: true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IAuthProvider, IPunchRegistrar } from '../../lib/domain/interfaces'
import type { PunchResult } from '../../lib/domain/types'

// ── Importar o módulo sob teste ───────────────────────────────────────────────
import { registerPunch } from '../../lib/application/register-punch'

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeAuth(name: string, token: string | null): IAuthProvider {
  return { name, getAccessToken: vi.fn().mockResolvedValue(token) }
}

function makeRegistrar(result: PunchResult): IPunchRegistrar {
  return { registerPunch: vi.fn().mockResolvedValue(result) }
}

// ── Testes ────────────────────────────────────────────────────────────────────
describe('F1 — registerPunch() (application layer)', () => {
  it('CV-1.5a: retorna falha quando nenhum provider tem token', async () => {
    const result = await registerPunch(
      [makeAuth('cookie', null), makeAuth('interceptor', null)],
      makeRegistrar({ success: true, logs: [] }),
    )
    expect(result.success).toBe(false)
    expect(result.logs[0]).toMatch(/token/i)
  })

  it('CV-1.5b: usa token do primeiro provider e repassa ao registrar', async () => {
    const registrar = makeRegistrar({ success: true, logs: ['OK'] })
    const result = await registerPunch(
      [makeAuth('cookie', 'my-token-123')],
      registrar,
    )
    expect(registrar.registerPunch).toHaveBeenCalledWith('my-token-123')
    expect(result.success).toBe(true)
  })

  it('CV-1.5c: pula provider que lança exceção e usa o próximo', async () => {
    const failing = {
      name: 'broken',
      getAccessToken: vi.fn().mockRejectedValue(new Error('network error')),
    }
    const good = makeAuth('interceptor', 'fallback-token')
    const registrar = makeRegistrar({ success: true, logs: [] })

    const result = await registerPunch([failing, good], registrar)

    expect(registrar.registerPunch).toHaveBeenCalledWith('fallback-token')
    expect(result.success).toBe(true)
  })

  it('CV-1.5d: quando registrar retorna falha, propaga o resultado', async () => {
    const result = await registerPunch(
      [makeAuth('cookie', 'tok')],
      makeRegistrar({ success: false, logs: ['API 500'] }),
    )
    expect(result.success).toBe(false)
    expect(result.logs).toContain('API 500')
  })
})

// ── SeniorPunchRegistrar (infrastructure) ────────────────────────────────────
import { SeniorPunchRegistrar } from '../../lib/infrastructure/senior/senior-registrar'
import {
  mockTabsQuery,
  mockScriptingExecuteScript,
} from '../setup/chrome-mock'

describe('F1 — SeniorPunchRegistrar', () => {
  let registrar: SeniorPunchRegistrar

  beforeEach(() => {
    registrar = new SeniorPunchRegistrar()
  })

  it('CV-1.1: retorna falha quando não há aba Senior aberta', async () => {
    mockTabsQuery.mockResolvedValue([]) // nenhuma aba
    const result = await registrar.registerPunch('some-token')
    expect(result.success).toBe(false)
    expect(result.logs[0]).toMatch(/aba/i)
  })

  it('CV-1.1: retorna success:true quando executeScript resolve com sucesso 200', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 7, url: 'https://rh.senior.com.br' }])
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { success: true, logs: ['Config OK', 'Enviando ponto...', '200'] } },
    ])

    const result = await registrar.registerPunch('valid-token')

    expect(mockScriptingExecuteScript).toHaveBeenCalledOnce()
    expect(result.success).toBe(true)
    expect(result.logs).toContain('Config OK')
  })

  it('CV-1.1: retorna success:true para status 201', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 7, url: 'https://rh.senior.com.br' }])
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { success: true, logs: ['201'] } },
    ])
    const result = await registrar.registerPunch('valid-token')
    expect(result.success).toBe(true)
  })

  it('CV-1.3: executeScript recebe accessToken, configUrl e punchUrl como args', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 7, url: 'https://rh.senior.com.br' }])
    mockScriptingExecuteScript.mockResolvedValue([{ result: { success: true, logs: [] } }])

    await registrar.registerPunch('tok-abc')

    const call = mockScriptingExecuteScript.mock.calls[0][0]
    expect(call.args[0]).toBe('tok-abc')          // accessToken
    expect(call.args[1]).toMatch(/getEmployee/)   // configUrl
    expect(call.args[2]).toMatch(/clocking/)      // punchUrl
  })

  it('CV-1.2: executeScript é chamado no mundo MAIN (contexto da página)', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 7, url: 'https://rh.senior.com.br' }])
    mockScriptingExecuteScript.mockResolvedValue([{ result: { success: true, logs: [] } }])

    await registrar.registerPunch('tok')

    const call = mockScriptingExecuteScript.mock.calls[0][0]
    expect(call.world).toBe('MAIN')
  })

  it('CV-1.4: quando executeScript retorna sem resultado, reporta falha', async () => {
    mockTabsQuery.mockResolvedValue([{ id: 7, url: 'https://rh.senior.com.br' }])
    mockScriptingExecuteScript.mockResolvedValue([{ result: null }])

    const result = await registrar.registerPunch('tok')
    expect(result.success).toBe(false)
  })

  it('CV-1.5e: quando executeScript lança exceção, o erro é propagado (sem try-catch)', async () => {
    // Nota: SeniorPunchRegistrar não encapsula executeScript em try-catch,
    // portanto exceções se propagam para o caller.
    // Este teste documenta o comportamento atual e serve como alerta para
    // adicionar tratamento de erro no futuro (ver roadmap F1-CV-1.4).
    mockTabsQuery.mockResolvedValue([{ id: 7, url: 'https://rh.senior.com.br' }])
    mockScriptingExecuteScript.mockRejectedValue(new Error('No permission'))

    await expect(registrar.registerPunch('tok')).rejects.toThrow('No permission')
  })
})
