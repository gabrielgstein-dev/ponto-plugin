/**
 * Saúde da detecção: distinguir "zero batidas" de "não consegui consultar".
 *
 * `fetchPunches` devolve `[]` nos dois casos. Essa ambiguidade fez o plugin
 * desenhar `--:--` — que se lê como "você não bateu" — enquanto na verdade
 * estava cego, e o usuário registrou ponto em duplicidade (2026-07-21).
 *
 * Só fontes AUTORITATIVAS (que implementam `probe`) contam. Um "zero" vindo do
 * cache local não prova nada sobre o servidor.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import {
  PunchDetector,
  getLastDetectionHealth,
  _resetDetectionHealthForTests,
} from '../../lib/application/detect-punches'
import type { IPunchProvider, PunchProbe } from '../../lib/domain/interfaces'

/** Fonte autoritativa (servidor): sabe dizer se conseguiu consultar. */
function authoritative(name: string, outcome: 'ok' | 'unavailable', times: string[] = []): IPunchProvider {
  return {
    name,
    priority: 1,
    fetchPunches: async () => times,
    probe: async (): Promise<PunchProbe> => ({ times, outcome }),
  }
}

/** Cache local: não implementa probe, logo não desfaz cegueira. */
function cacheOnly(name: string, times: string[] = []): IPunchProvider {
  return { name, priority: 2, fetchPunches: async () => times }
}

function throwing(name: string): IPunchProvider {
  return {
    name,
    priority: 1,
    fetchPunches: async () => { throw new Error('boom') },
    probe: async () => { throw new Error('boom') },
  }
}

beforeEach(() => {
  _resetDetectionHealthForTests()
})

describe('DetectionHealth', () => {
  it('todas as fontes autoritativas indisponíveis → CEGO', async () => {
    // Exatamente o incidente: sem token no seniorActiveUser, GP em 502.
    const d = new PunchDetector([
      authoritative('seniorActiveUser', 'unavailable'),
      authoritative('gestaoPonto', 'unavailable'),
    ])
    await d.detect(new Date())
    expect(getLastDetectionHealth()).toEqual({ probed: 2, ok: 0, blind: true })
  })

  it('uma fonte respondendo zero batidas → NÃO cego (zero é verdade)', async () => {
    const d = new PunchDetector([
      authoritative('seniorActiveUser', 'unavailable'),
      authoritative('gestaoPonto', 'ok', []),
    ])
    await d.detect(new Date())
    const h = getLastDetectionHealth()
    expect(h.blind).toBe(false)
    expect(h.ok).toBe(1)
  })

  it('cache local com zero NÃO desfaz a cegueira', async () => {
    // Regressão fina: no incidente o localStorage respondeu (sem batidas do
    // dia). Se ele contasse como fonte válida, a tela seguiria mentindo.
    const d = new PunchDetector([
      authoritative('seniorActiveUser', 'unavailable'),
      authoritative('gestaoPonto', 'unavailable'),
      cacheOnly('localStorage', []),
    ])
    await d.detect(new Date())
    expect(getLastDetectionHealth().blind).toBe(true)
  })

  it('exceção conta como indisponível', async () => {
    const d = new PunchDetector([throwing('seniorActiveUser')])
    await d.detect(new Date())
    expect(getLastDetectionHealth()).toEqual({ probed: 1, ok: 0, blind: true })
  })

  it('sem fontes autoritativas → não afirma cegueira', async () => {
    // Build manual (só ManualPunchProvider): não há servidor a consultar,
    // então "zero" é legítimo e alertar seria falso positivo.
    const d = new PunchDetector([cacheOnly('manual', [])])
    await d.detect(new Date())
    expect(getLastDetectionHealth()).toEqual({ probed: 0, ok: 0, blind: false })
  })

  it('fonte indisponível não impede usar batidas de outra que respondeu', async () => {
    const d = new PunchDetector([
      authoritative('seniorActiveUser', 'unavailable'),
      authoritative('gestaoPonto', 'ok', ['08:05']),
    ])
    const r = await d.detect(new Date())
    expect(r?.times).toEqual(['08:05'])
    expect(getLastDetectionHealth().blind).toBe(false)
  })
})
