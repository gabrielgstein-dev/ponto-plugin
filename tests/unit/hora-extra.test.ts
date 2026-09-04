/**
 * Hora extra do dia — domínio puro.
 *
 * O valor é um DELTA sobre a jornada contratual, não um total. Os testes abaixo
 * fixam esse contrato: o mesmo "+60" vale 7h num contrato de 6h e 9h num de 8h.
 */
import { describe, it, expect } from 'vitest'
import {
  HORA_EXTRA_MAX,
  HORA_EXTRA_MIN,
  HORA_EXTRA_STEP,
  clampHoraExtra,
  jornadaAlvo,
  formatHoraExtra,
} from '../../lib/domain/hora-extra'

describe('clampHoraExtra()', () => {
  it('mantém valores dentro da faixa e no passo', () => {
    expect(clampHoraExtra(0)).toBe(0)
    expect(clampHoraExtra(60)).toBe(60)
    expect(clampHoraExtra(-45)).toBe(-45)
  })

  it('prende no teto e no piso', () => {
    expect(clampHoraExtra(999)).toBe(HORA_EXTRA_MAX)
    expect(clampHoraExtra(-999)).toBe(HORA_EXTRA_MIN)
  })

  it('arredonda para o passo de 15min', () => {
    expect(clampHoraExtra(7)).toBe(0)
    expect(clampHoraExtra(8)).toBe(HORA_EXTRA_STEP)
    expect(clampHoraExtra(52)).toBe(45)
  })

  it('trata lixo vindo do storage como "sem extra"', () => {
    expect(clampHoraExtra(null)).toBe(0)
    expect(clampHoraExtra(undefined)).toBe(0)
    expect(clampHoraExtra('60')).toBe(0)
    expect(clampHoraExtra(NaN)).toBe(0)
    expect(clampHoraExtra(Infinity)).toBe(0)
  })
})

describe('jornadaAlvo()', () => {
  it('soma o delta ao contrato — o mesmo +1h em contratos diferentes', () => {
    expect(jornadaAlvo(480, 60)).toBe(540)
    expect(jornadaAlvo(360, 60)).toBe(420)
    expect(jornadaAlvo(420, 60)).toBe(480)
  })

  it('sem extra devolve a jornada contratual intacta', () => {
    expect(jornadaAlvo(480, 0)).toBe(480)
    expect(jornadaAlvo(480, null)).toBe(480)
    expect(jornadaAlvo(480, undefined)).toBe(480)
  })

  it('aceita delta negativo (sair mais cedo)', () => {
    expect(jornadaAlvo(480, -60)).toBe(420)
  })

  it('nunca devolve jornada negativa', () => {
    expect(jornadaAlvo(60, -120)).toBe(0)
  })

  it('aplica o clamp antes de somar', () => {
    expect(jornadaAlvo(480, 999)).toBe(480 + HORA_EXTRA_MAX)
  })
})

describe('formatHoraExtra()', () => {
  it('formata horas cheias, minutos e mistos', () => {
    expect(formatHoraExtra(60)).toBe('+1h')
    expect(formatHoraExtra(120)).toBe('+2h')
    expect(formatHoraExtra(30)).toBe('+30min')
    expect(formatHoraExtra(90)).toBe('+1h30')
    expect(formatHoraExtra(75)).toBe('+1h15')
  })

  it('usa sinal de menos para delta negativo', () => {
    expect(formatHoraExtra(-60)).toBe('−1h')
    expect(formatHoraExtra(-45)).toBe('−45min')
    expect(formatHoraExtra(-90)).toBe('−1h30')
  })

  it('zero não vira rótulo', () => {
    expect(formatHoraExtra(0)).toBe('')
  })
})
