/**
 * applyTimes() — atribuição de slots por índice puro.
 *
 * Regra: 1º batimento=entrada, 2º=almoco, 3º=volta, 4º=saida.
 * Sem heurística de horário, sem usar `almocoHorario`/`almocoDur`/`jornada`
 * pra inferir slot. Esses settings só alimentam estimativas de display.
 *
 * Regressão: usuário com 2 batimentos onde o 2º é depois do "volta estimado"
 * (ex.: 08:58 + 13:58 com lunch padrão 12:00+60min) — anteriormente caía em
 * `volta`, deixando `almoco` vazio. Agora deve cair em `almoco`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/application/calc-schedule', () => ({
  calcHorarios: vi.fn(),
}))

import { applyTimes, type ApplyTimesContext } from '../../lib/application/apply-punches'
import { resetState, state, applySettings } from '../../lib/application/state'
import { DEFAULT_SETTINGS } from '../../lib/domain/types'

const FAKE_NOW = new Date(2026, 3, 28, 18, 0, 0) // 28/04/2026 18:00 → nowMin = 1080

function makeCtx(): ApplyTimesContext {
  return {
    stateRepo: { saveState: vi.fn().mockResolvedValue(undefined) } as any,
    onRender: vi.fn(),
    onToast: vi.fn(),
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: FAKE_NOW })
  resetState()
  applySettings({ ...DEFAULT_SETTINGS })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('applyTimes() — slots por índice', () => {
  it('1 batimento → entrada apenas', () => {
    applyTimes(['08:00'], 'test', true, makeCtx())
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBeNull()
    expect(state.volta).toBeNull()
    expect(state.saida).toBeNull()
  })

  it('2 batimentos no horário típico → entrada + almoco', () => {
    applyTimes(['08:00', '12:00'], 'test', true, makeCtx())
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBe('12:00')
    expect(state.volta).toBeNull()
    expect(state.saida).toBeNull()
  })

  it('regressão: 2 batimentos com almoço atrasado (08:58 + 13:58) → almoco, NUNCA volta', () => {
    // Antes do fix: 13:58 > almocoHorario(12:00)+almocoDur(60)=13:00 → caía em `volta`
    // Agora: índice 1 → sempre `almoco`
    applyTimes(['08:58', '13:58'], 'test', true, makeCtx())
    expect(state.entrada).toBe('08:58')
    expect(state.almoco).toBe('13:58')
    expect(state.volta).toBeNull()
    expect(state.saida).toBeNull()
  })

  it('3 batimentos → entrada + almoco + volta', () => {
    applyTimes(['08:00', '12:00', '13:00'], 'test', true, makeCtx())
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBe('12:00')
    expect(state.volta).toBe('13:00')
    expect(state.saida).toBeNull()
  })

  it('4 batimentos → todos os slots preenchidos', () => {
    applyTimes(['08:00', '12:00', '13:00', '17:00'], 'test', true, makeCtx())
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBe('12:00')
    expect(state.volta).toBe('13:00')
    expect(state.saida).toBe('17:00')
  })

  it('5+ batimentos → ignora extras (apenas os 4 primeiros)', () => {
    applyTimes(['08:00', '12:00', '13:00', '17:00', '18:00'], 'test', true, makeCtx())
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBe('12:00')
    expect(state.volta).toBe('13:00')
    expect(state.saida).toBe('17:00')
  })

  it('settings.almocoHorario/almocoDur não afetam atribuição de slot', () => {
    // Mesmo com lunch configurado pra 11:00+30min (volta estimada=11:30),
    // o 2º batimento às 13:58 ainda deve ser `almoco`.
    applySettings({ ...DEFAULT_SETTINGS, almocoHorario: '11:00', almocoDur: 30 })
    applyTimes(['08:58', '13:58'], 'test', true, makeCtx())
    expect(state.almoco).toBe('13:58')
    expect(state.volta).toBeNull()
  })

  it('batimentos futuros são filtrados (não atribuem slot)', () => {
    // FAKE_NOW=18:00 → janela aceita até 18:05; 23:00 é futuro
    applyTimes(['08:00', '12:00', '23:00'], 'test', true, makeCtx())
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBe('12:00')
    expect(state.volta).toBeNull()
    expect(state.saida).toBeNull()
  })
})
