/**
 * F2 — Garantir sincronização imediata plugin → Senior
 *
 * Cobre os critérios:
 *   CV-2.1  detect() retorna novo horário após batimento
 *   CV-2.2  Cache/pending são gerenciados corretamente
 *   CV-2.3  Prioridade de providers: primary (≤2) antes de fallback (>2)
 *   CV-2.4  Quando primary falha, fallback é usado
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IPunchProvider } from '../../lib/domain/interfaces'

import {
  PunchDetector,
  addPendingPunch,
  loadPendingPunches,
} from '../../lib/application/detect-punches'
import { mockStorageGet, mockStorageSet } from '../setup/chrome-mock'

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeProvider(
  name: string,
  priority: number,
  times: string[],
  { throws = false } = {},
): IPunchProvider {
  return {
    name,
    priority,
    fetchPunches: throws
      ? vi.fn().mockRejectedValue(new Error(`${name} falhou`))
      : vi.fn().mockResolvedValue(times),
  }
}

const TODAY = new Date()

// ── Limpar pending punches entre testes ───────────────────────────────────────
beforeEach(async () => {
  mockStorageGet.mockResolvedValue({ pendingPunches: [] })
  await loadPendingPunches()
  mockStorageGet.mockResolvedValue({}) // restaura padrão
})

// ── PunchDetector ─────────────────────────────────────────────────────────────
describe('F2 — PunchDetector', () => {
  it('CV-2.3a: primary provider (priority≤2) retorna times → resultado imediato', async () => {
    const primary = makeProvider('gp', 1, ['08:00', '12:00'])
    const fallback = makeProvider('storage', 3, ['07:00'])
    const detector = new PunchDetector([primary, fallback])

    const result = await detector.detect(TODAY)

    expect(result).not.toBeNull()
    expect(result!.times).toEqual(['08:00', '12:00'])
    expect(result!.source).toBe('gp')
    // fallback não deve ser chamado
    expect(fallback.fetchPunches).not.toHaveBeenCalled()
  })

  it('CV-2.3b: todos primaries vazios → fallback consultado', async () => {
    const primary = makeProvider('gp', 1, [])
    const fallback = makeProvider('storage', 3, ['08:30'])
    const detector = new PunchDetector([primary, fallback])

    const result = await detector.detect(TODAY)

    expect(result).not.toBeNull()
    expect(result!.times).toContain('08:30')
    expect(result!.source).toBe('storage')
  })

  it('CV-2.4a: quando primary lança exceção, fallback é usado', async () => {
    const broken = makeProvider('broken', 1, [], { throws: true })
    const fallback = makeProvider('storage', 3, ['09:00'])
    const detector = new PunchDetector([broken, fallback])

    const result = await detector.detect(TODAY, true)

    expect(result).not.toBeNull()
    expect(result!.source).toBe('storage')
  })

  it('CV-2.4b: todos os providers falham → retorna null', async () => {
    const p1 = makeProvider('gp', 1, [])
    const p2 = makeProvider('storage', 3, [])
    const detector = new PunchDetector([p1, p2])

    const result = await detector.detect(TODAY)
    expect(result).toBeNull()
  })

  it('CV-2.1: pending punches são mergeados com resultados do provider', async () => {
    // Adiciona um pending punch antes da detecção
    mockStorageSet.mockResolvedValue(undefined)
    addPendingPunch('10:00')

    const primary = makeProvider('gp', 1, ['08:00'])
    const detector = new PunchDetector([primary])

    const result = await detector.detect(TODAY)

    expect(result!.times).toContain('08:00')
    expect(result!.times).toContain('10:00')
    expect(result!.times).toEqual(['08:00', '10:00']) // sorted
  })

  it('CV-2.1: resultados são retornados ordenados e sem duplicatas', async () => {
    const primary = makeProvider('gp', 1, ['12:00', '08:00', '12:00'])
    const detector = new PunchDetector([primary])

    const result = await detector.detect(TODAY)

    expect(result!.times).toEqual(['08:00', '12:00'])
  })

  it('CV-2.3c: quando há dois primaries, ambos são consultados e times são mergeados', async () => {
    const p1 = makeProvider('gp', 1, ['08:00'])
    const p2 = makeProvider('other', 2, ['13:00'])
    const fallback = makeProvider('storage', 3, ['99:00'])
    const detector = new PunchDetector([p1, p2, fallback])

    const result = await detector.detect(TODAY)

    expect(result!.times).toContain('08:00')
    expect(result!.times).toContain('13:00')
    expect(result!.times).not.toContain('99:00')
  })

  it('CV-2.2: sem providers e sem pending → null', async () => {
    const detector = new PunchDetector([])
    const result = await detector.detect(TODAY)
    expect(result).toBeNull()
  })

  it('CV-2.2: sem providers, mas com pending → usa pending', async () => {
    mockStorageSet.mockResolvedValue(undefined)
    addPendingPunch('11:00')

    const detector = new PunchDetector([])
    const result = await detector.detect(TODAY)

    expect(result).not.toBeNull()
    expect(result!.times).toContain('11:00')
    expect(result!.source).toBe('pending')
  })
})

// ── addPendingPunch / loadPendingPunches ──────────────────────────────────────
describe('F2 — addPendingPunch e loadPendingPunches', () => {
  it('CV-2.1: addPendingPunch persiste no storage', () => {
    mockStorageSet.mockResolvedValue(undefined)
    addPendingPunch('08:00')
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ pendingPunches: expect.arrayContaining([expect.objectContaining({ time: '08:00' })]) }),
    )
  })

  it('CV-2.2: addPendingPunch não duplica o mesmo horário', () => {
    mockStorageSet.mockResolvedValue(undefined)
    addPendingPunch('08:00')
    addPendingPunch('08:00')
    // O segundo set deve conter apenas 1 entrada com '08:00'
    const lastCall = mockStorageSet.mock.calls[mockStorageSet.mock.calls.length - 1][0]
    const entries = lastCall.pendingPunches.filter((p: { time: string }) => p.time === '08:00')
    expect(entries).toHaveLength(1)
  })

  it('CV-2.2: loadPendingPunches filtra entradas expiradas do storage', async () => {
    const expiredTs = Date.now() - 3 * 60 * 1000 // 3 min atrás (TTL=2min)
    mockStorageGet.mockResolvedValue({
      pendingPunches: [{ time: '07:00', ts: expiredTs }],
    })
    await loadPendingPunches()

    // Após carregar, pending interno não deve ter o expirado
    const detector = new PunchDetector([])
    const result = await detector.detect(TODAY)
    expect(result).toBeNull() // pending foi expirado, nada restou
  })

  it('CV-2.2: loadPendingPunches mantém entradas recentes', async () => {
    const freshTs = Date.now() - 30 * 1000 // 30 segundos atrás
    mockStorageGet.mockResolvedValue({
      pendingPunches: [{ time: '08:00', ts: freshTs }],
    })
    await loadPendingPunches()

    const detector = new PunchDetector([])
    const result = await detector.detect(TODAY)
    expect(result).not.toBeNull()
    expect(result!.times).toContain('08:00')
  })
})
