/**
 * generateDailyOffsets() — jitter das batidas automáticas.
 *
 * Invariante central (o motivo da feature existir): o desvio do total
 * trabalhado do dia tem que caber na tolerância de apuração (|worked − prev| ≤
 * 10min → saldo 0), e nunca reivindicar tempo a MAIS. Logo:
 *   workedDelta = (almoco − entrada) + (saida − volta) ∈ [−9, 0]
 * e cada offset é ≠ 0 (garante minuto não-nominal → "não parece robô").
 */
import { describe, it, expect } from 'vitest'

import {
  generateDailyOffsets,
  computeWorkedDelta,
  OFFSET_MIN,
  OFFSET_MAX,
  MAX_WORKED_UNDER,
  type SlotOffsets,
} from '../../lib/domain/auto-punch-jitter'

// PRNG determinístico (mulberry32) pra testar muitas sequências reproduzíveis.
function mulberry32(seed: number): () => number {
  let s = seed
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SLOTS = ['entrada', 'almoco', 'volta', 'saida'] as const

describe('generateDailyOffsets() — invariantes', () => {
  it('mantém workedDelta ∈ [−9, 0] em 1000 sementes', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const offsets = generateDailyOffsets(mulberry32(seed))
      const delta = computeWorkedDelta(offsets)
      expect(delta, `seed=${seed}`).toBeGreaterThanOrEqual(-MAX_WORKED_UNDER)
      expect(delta, `seed=${seed}`).toBeLessThanOrEqual(0)
    }
  })

  it('todo offset está em [OFFSET_MIN, OFFSET_MAX] e é ≠ 0', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const offsets = generateDailyOffsets(mulberry32(seed))
      for (const slot of SLOTS) {
        expect(offsets[slot], `seed=${seed} slot=${slot}`).toBeGreaterThanOrEqual(OFFSET_MIN)
        expect(offsets[slot], `seed=${seed} slot=${slot}`).toBeLessThanOrEqual(OFFSET_MAX)
        expect(offsets[slot], `seed=${seed} slot=${slot}`).not.toBe(0)
      }
    }
  })

  it('é determinístico: mesma sequência de rng → mesmos offsets', () => {
    const a = generateDailyOffsets(mulberry32(12345))
    const b = generateDailyOffsets(mulberry32(12345))
    expect(a).toEqual(b)
  })

  it('produz variação: sementes diferentes geram tuplas diferentes', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 50; seed++) {
      seen.add(JSON.stringify(generateDailyOffsets(mulberry32(seed))))
    }
    // Não exige 50 distintas, mas tem que haver diversidade real (não constante).
    expect(seen.size).toBeGreaterThan(5)
  })
})

describe('computeWorkedDelta()', () => {
  it('calcula (almoco − entrada) + (saida − volta)', () => {
    const offsets: SlotOffsets = { entrada: 4, almoco: 2, volta: 4, saida: 2 }
    // (2 − 4) + (2 − 4) = −4
    expect(computeWorkedDelta(offsets)).toBe(-4)
  })

  it('offset uniforme (todos iguais) → delta 0 (durações preservadas)', () => {
    const offsets: SlotOffsets = { entrada: 5, almoco: 5, volta: 5, saida: 5 }
    expect(computeWorkedDelta(offsets)).toBe(0)
  })
})
