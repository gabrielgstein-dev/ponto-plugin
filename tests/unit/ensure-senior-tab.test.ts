/**
 * ensureSeniorTab() — garante uma aba Senior utilizável ANTES da batida.
 *
 * Contexto (log de 2026-07-21 09:43): o auto-punch morreu em 20ms com "Nenhum
 * token encontrado" logo após um startup do Chrome. Sem aba Senior o
 * SeniorPageAuth volta null na hora e o registrar não teria onde injetar o
 * fetch. Abrir a aba realimenta as fontes de token e dá onde bater.
 *
 * Invariantes travados aqui:
 *  - nunca fecha aba que o usuário abriu;
 *  - abre em background (não rouba foco no meio do expediente);
 *  - sessão morta (login) é falha explícita, não espera até o timeout;
 *  - nunca vaza aba aberta quando desiste.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { ensureSeniorTab, closeSeniorTab } from '../../lib/application/ensure-senior-tab'
import { getLogs, _resetForTests } from '../../lib/domain/log-store'
import {
  mockTabsQuery,
  mockTabsCreate,
  mockTabsGet,
  mockTabsRemove,
} from '../setup/chrome-mock'

const SENIOR_TAB = { id: 7, url: 'https://platform.senior.com.br/senior-x/#/Favoritos/1' }

const ready = () => Promise.resolve(true)
const neverReady = () => Promise.resolve(false)

beforeEach(() => {
  _resetForTests()
  vi.useFakeTimers()
  mockTabsQuery.mockResolvedValue([])
  mockTabsCreate.mockResolvedValue({ id: 99 })
  mockTabsGet.mockResolvedValue({ id: 99, status: 'complete', url: 'https://platform.senior.com.br/senior-x/#/clocking-event' })
  mockTabsRemove.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Executa a promise deixando os sleeps internos avançarem. `advanceTimersByTime`
 * sozinho não basta: cada iteração do poll agenda o próximo timer só depois de
 * um await, então precisamos ceder o microtask queue entre os avanços.
 */
async function runWithTimers<T>(p: Promise<T>, stepMs = 500, steps = 130): Promise<T> {
  for (let i = 0; i < steps; i++) {
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(stepMs)
  }
  return p
}

async function logText(): Promise<string> {
  return (await getLogs()).map(e => e.msg).join('\n')
}

describe('ensureSeniorTab() — aba já existe', () => {
  it('reusa a aba do usuário sem abrir outra', async () => {
    mockTabsQuery.mockResolvedValue([SENIOR_TAB])

    const handle = await ensureSeniorTab(ready)

    expect(handle).toEqual({ tabId: 7, opened: false })
    expect(mockTabsCreate).not.toHaveBeenCalled()
  })

  it('closeSeniorTab NÃO fecha aba que o usuário já tinha aberta', async () => {
    mockTabsQuery.mockResolvedValue([SENIOR_TAB])

    const handle = await ensureSeniorTab(ready)
    await closeSeniorTab(handle)

    expect(mockTabsRemove).not.toHaveBeenCalled()
  })
})

describe('ensureSeniorTab() — abre quando não existe', () => {
  it('abre em BACKGROUND (active: false) para não roubar o foco', async () => {
    const handle = await runWithTimers(ensureSeniorTab(ready))

    expect(handle).toEqual({ tabId: 99, opened: true })
    expect(mockTabsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    )
  })

  it('aponta para a página de batida do Senior', async () => {
    await runWithTimers(ensureSeniorTab(ready))

    const url = mockTabsCreate.mock.calls[0][0].url as string
    expect(url).toContain('platform.senior.com.br')
    expect(url).toContain('clocking')
  })

  it('espera a SPA autenticar antes de devolver a aba', async () => {
    // Só fica pronta na 3ª sondagem — simula o boot da SPA.
    const isReady = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)

    const handle = await runWithTimers(ensureSeniorTab(isReady))

    expect(handle?.opened).toBe(true)
    expect(isReady.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('closeSeniorTab fecha a aba que NÓS abrimos', async () => {
    const handle = await runWithTimers(ensureSeniorTab(ready))
    await closeSeniorTab(handle)

    expect(mockTabsRemove).toHaveBeenCalledWith(99)
  })
})

describe('ensureSeniorTab() — desistências não vazam aba', () => {
  it('sessão morta (login): falha rápido e fecha a aba', async () => {
    mockTabsGet.mockResolvedValue({
      id: 99,
      status: 'complete',
      url: 'https://platform.senior.com.br/login?redirect=x',
    })

    const handle = await runWithTimers(ensureSeniorTab(neverReady))

    expect(handle).toBeNull()
    expect(mockTabsRemove).toHaveBeenCalledWith(99)
    expect(await logText()).toContain('LOGIN')
  })

  it('SPA nunca autentica: desiste no timeout e fecha a aba', async () => {
    const handle = await runWithTimers(ensureSeniorTab(neverReady))

    expect(handle).toBeNull()
    expect(mockTabsRemove).toHaveBeenCalledWith(99)
    expect(await logText()).toContain('não autenticou')
  })

  it('aba fechada pelo usuário no meio do boot não trava o fluxo', async () => {
    mockTabsGet.mockRejectedValue(new Error('No tab with id: 99'))

    const handle = await runWithTimers(ensureSeniorTab(neverReady))

    expect(handle).toBeNull()
  })

  it('sonda que explode não derruba a batida — trata como "não pronta"', async () => {
    const handle = await runWithTimers(
      ensureSeniorTab(() => Promise.reject(new Error('auth explodiu'))),
    )

    expect(handle).toBeNull()
    expect(mockTabsRemove).toHaveBeenCalledWith(99)
  })

  it('tabs.create falhando devolve null sem lançar', async () => {
    mockTabsCreate.mockRejectedValue(new Error('sem permissão de aba'))

    const handle = await runWithTimers(ensureSeniorTab(ready))

    expect(handle).toBeNull()
    expect(await logText()).toContain('falha ao abrir aba Senior')
  })

  it('tabs.remove falhando (aba já fechada) não propaga exceção', async () => {
    mockTabsRemove.mockRejectedValue(new Error('No tab with id: 99'))
    const handle = await runWithTimers(ensureSeniorTab(ready))

    await expect(closeSeniorTab(handle)).resolves.toBeUndefined()
  })
})
