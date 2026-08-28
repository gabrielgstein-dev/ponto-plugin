/**
 * runAutoPunch() — ordem de operações em torno da aba Senior.
 *
 * O ponto destes testes é o CONTRATO entre runAutoPunch e ensureSeniorTab:
 * garantir a aba ANTES de tentar bater, não tentar bater sem aba utilizável, e
 * nunca deixar aba órfã aberta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/application/ensure-senior-tab', () => ({
  ensureSeniorTab: vi.fn(),
  closeSeniorTab: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/application/register-punch', () => ({
  registerPunch: vi.fn(),
  resolveAccessToken: vi.fn().mockResolvedValue(null),
}))

import { runAutoPunch } from '../../lib/application/auto-punch'
import { ensureSeniorTab, closeSeniorTab } from '../../lib/application/ensure-senior-tab'
import { registerPunch, resolveAccessToken } from '../../lib/application/register-punch'

const mockEnsure = vi.mocked(ensureSeniorTab)
const mockClose = vi.mocked(closeSeniorTab)
const mockRegister = vi.mocked(registerPunch)

const OPENED_BY_US = { tabId: 99, opened: true }

beforeEach(() => {
  mockEnsure.mockResolvedValue(OPENED_BY_US)
  mockClose.mockResolvedValue(undefined)
  mockRegister.mockResolvedValue({ success: false, logs: ['falhou'] })
})

describe('runAutoPunch() — garantia de aba', () => {
  it('sem aba utilizável, NÃO tenta bater', async () => {
    mockEnsure.mockResolvedValue(null)

    const result = await runAutoPunch()

    expect(mockRegister).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.confirmed).toBe(false)
  })

  it('sem aba utilizável, o motivo chega ao log do handler', async () => {
    mockEnsure.mockResolvedValue(null)

    const result = await runAutoPunch()

    expect(result.logs.join()).toMatch(/aba Senior/i)
  })

  it('garante a aba ANTES de chamar o registrar', async () => {
    const order: string[] = []
    mockEnsure.mockImplementation(async () => { order.push('ensure'); return OPENED_BY_US })
    mockRegister.mockImplementation(async () => { order.push('register'); return { success: false, logs: [] } })

    await runAutoPunch()

    expect(order).toEqual(['ensure', 'register'])
  })

  it('fecha a aba mesmo quando a batida falha', async () => {
    await runAutoPunch()
    expect(mockClose).toHaveBeenCalledWith(OPENED_BY_US)
  })

  it('fecha a aba mesmo quando o registrar EXPLODE — sem vazar aba órfã', async () => {
    mockRegister.mockRejectedValue(new Error('boom'))

    await expect(runAutoPunch()).rejects.toThrow('boom')
    expect(mockClose).toHaveBeenCalledWith(OPENED_BY_US)
  })
})

// Sem isto, o SeniorTokenStorageAuth podia existir, ter testes verdes e nunca
// ser usado — que é literalmente o bug de 2026-07-21 (token no storage, cadeia
// da batida sem olhar pra ele).
describe('runAutoPunch() — cadeia de auth efetivamente usada', () => {
  it('o registrar recebe a cadeia com tokenStorage no fim', async () => {
    await runAutoPunch()

    const chain = mockRegister.mock.calls[0][0]
    expect(chain.map(p => p.name)).toEqual([
      'pageContext', 'interceptor', 'tokenStorage',
    ])
  })

  it('a sonda de prontidão da aba usa a MESMA cadeia', async () => {
    let probe: (() => Promise<boolean>) | undefined
    mockEnsure.mockImplementation(async isReady => { probe = isReady; return OPENED_BY_US })

    await runAutoPunch()
    await probe!()

    const chain = vi.mocked(resolveAccessToken).mock.calls[0][0]
    expect(chain.map(p => p.name)).toContain('tokenStorage')
  })
})
