/**
 * Cobertura para correções da auditoria de alta prioridade:
 *  - Fix #2: sort cronológico (numeric) em detect-punches — invariante de slots
 *           por índice (1º=entrada, 2º=almoço, 3º=volta, 4º=saída) deve sobreviver
 *           a horários sem zero-padding tipo "9:30".
 *  - Fix #3: savePendingPunches / loadPendingPunches não devem mais engolir
 *           falhas em silêncio — devem chamar debugWarn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const debugWarnSpy = vi.fn()
const debugLogSpy = vi.fn()

vi.mock('../../lib/domain/debug', () => ({
  debugLog: (...args: unknown[]) => debugLogSpy(...args),
  debugWarn: (...args: unknown[]) => debugWarnSpy(...args),
  errorLog: vi.fn(),
}))

import {
  PunchDetector,
  addPendingPunch,
  loadPendingPunches,
} from '../../lib/application/detect-punches'
import type { IPunchProvider } from '../../lib/domain/interfaces'
import { mockStorageGet, mockStorageSet } from '../setup/chrome-mock'

function makeProvider(name: string, priority: number, times: string[]): IPunchProvider {
  return { name, priority, fetchPunches: vi.fn().mockResolvedValue(times) }
}

const TODAY = new Date()

beforeEach(async () => {
  debugWarnSpy.mockReset()
  debugLogSpy.mockReset()
  mockStorageGet.mockResolvedValue({ pendingPunches: [] })
  await loadPendingPunches()
  mockStorageGet.mockResolvedValue({})
})

describe('Fix #2 — ordem cronológica numérica', () => {
  it('coloca "9:30" antes de "12:00" (lexicograficamente seria o contrário)', async () => {
    const provider = makeProvider('gp', 1, ['12:00', '9:30'])
    const detector = new PunchDetector([provider])
    const result = await detector.detect(TODAY)
    expect(result!.times).toEqual(['9:30', '12:00'])
  })

  it('mantém ordem cronológica ao mesclar batimentos do provider com pending punches', async () => {
    mockStorageSet.mockResolvedValue(undefined)
    addPendingPunch('9:30')
    const provider = makeProvider('gp', 1, ['12:00', '8:00'])
    const detector = new PunchDetector([provider])
    const result = await detector.detect(TODAY)
    // sem o fix, sort lexicográfico produziria ['12:00', '8:00', '9:30']
    expect(result!.times).toEqual(['8:00', '9:30', '12:00'])
  })

  it('usa pending puro também em ordem cronológica', async () => {
    mockStorageSet.mockResolvedValue(undefined)
    addPendingPunch('13:00')
    addPendingPunch('9:00')
    const detector = new PunchDetector([])
    const result = await detector.detect(TODAY)
    expect(result!.times).toEqual(['9:00', '13:00'])
  })

  it('ordena corretamente quatro batimentos (slots completos)', async () => {
    const provider = makeProvider('gp', 1, ['17:30', '8:00', '13:00', '12:00'])
    const detector = new PunchDetector([provider])
    const result = await detector.detect(TODAY)
    // Crítico: a invariante "1º=entrada, 2º=almoço, 3º=volta, 4º=saída"
    // depende dessa ordem. Sem o fix, "8:00" iria para o final.
    expect(result!.times).toEqual(['8:00', '12:00', '13:00', '17:30'])
  })
})

describe('Fix #3 — falhas de storage não são mais silenciosas', () => {
  it('savePendingPunches loga via debugWarn quando chrome.storage.local.set lança sincronamente', async () => {
    mockStorageSet.mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    addPendingPunch('10:00')
    // savePendingPunches é fire-and-forget; espera microtask resolver.
    await new Promise(r => setTimeout(r, 0))
    expect(debugWarnSpy).toHaveBeenCalledWith(
      'savePendingPunches falhou:',
      'quota exceeded',
    )
  })

  it('savePendingPunches loga via debugWarn quando chrome.storage.local.set rejeita a Promise (caminho real de prod)', async () => {
    mockStorageSet.mockRejectedValueOnce(new Error('extension context invalidated'))
    addPendingPunch('11:00')
    await new Promise(r => setTimeout(r, 0))
    expect(debugWarnSpy).toHaveBeenCalledWith(
      'savePendingPunches falhou:',
      'extension context invalidated',
    )
  })

  it('loadPendingPunches loga via debugWarn quando chrome.storage.local.get rejeita', async () => {
    mockStorageGet.mockRejectedValueOnce(new Error('storage indisponível'))
    await loadPendingPunches()
    expect(debugWarnSpy).toHaveBeenCalledWith(
      'loadPendingPunches falhou:',
      'storage indisponível',
    )
  })

  it('savePendingPunches em condição normal NÃO chama debugWarn', async () => {
    mockStorageSet.mockResolvedValue(undefined)
    addPendingPunch('12:00')
    await new Promise(r => setTimeout(r, 0))
    expect(debugWarnSpy).not.toHaveBeenCalled()
  })
})
