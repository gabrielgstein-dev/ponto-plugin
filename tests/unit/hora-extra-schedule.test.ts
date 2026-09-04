/**
 * Hora extra do dia aplicada ao cálculo da saída — e ao que ela NÃO pode tocar.
 *
 * `calcHorarios()` é o único ponto que conhece o override: dele descem a
 * estimativa na UI, o lembrete, o alarme `autopunch_saida` e a notificação de
 * timesheet. O banco de horas fica de fora de propósito.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { calcHorarios } from '../../lib/application/calc-schedule'
import { applyPartialState, applySettings, resetState, state } from '../../lib/application/state'
import { buildDayRecord } from '../../lib/application/calc-hour-bank'
import { DEFAULT_SETTINGS, DEFAULT_STATE } from '../../lib/domain/types'

beforeEach(() => {
  applySettings({ ...DEFAULT_SETTINGS })
  applyPartialState({ ...DEFAULT_STATE })
})

describe('calcHorarios() com hora extra — só entrada batida', () => {
  it('sem extra: saída = entrada + jornada + almoço', () => {
    applyPartialState({ entrada: '08:00', horaExtra: 0 })
    calcHorarios()
    expect(state._saidaEstimada).toBe('17:00')
  })

  it('+1h empurra a saída em 1h', () => {
    applyPartialState({ entrada: '08:00', horaExtra: 60 })
    calcHorarios()
    expect(state._saidaEstimada).toBe('18:00')
  })

  it('+2h (teto) empurra 2h', () => {
    applyPartialState({ entrada: '08:00', horaExtra: 120 })
    calcHorarios()
    expect(state._saidaEstimada).toBe('19:00')
  })

  it('delta negativo antecipa a saída', () => {
    applyPartialState({ entrada: '08:00', horaExtra: -60 })
    calcHorarios()
    expect(state._saidaEstimada).toBe('16:00')
  })

  it('passo quebrado de 15min chega inteiro na estimativa', () => {
    applyPartialState({ entrada: '08:00', horaExtra: 45 })
    calcHorarios()
    expect(state._saidaEstimada).toBe('17:45')
  })

  it('é DELTA, não total: contrato de 6h com +1h vira alvo de 7h', () => {
    applySettings({ ...DEFAULT_SETTINGS, jornada: 360 })
    applyPartialState({ entrada: '08:00', horaExtra: 60 })
    calcHorarios()
    // 08:00 + 7h de trabalho + 1h de almoço
    expect(state._saidaEstimada).toBe('16:00')
  })

  it('valor ausente/corrompido no storage não desloca nada', () => {
    applyPartialState({ entrada: '08:00', horaExtra: null })
    calcHorarios()
    expect(state._saidaEstimada).toBe('17:00')

    applyPartialState({ entrada: '08:00', horaExtra: 'muito' as unknown as number })
    calcHorarios()
    expect(state._saidaEstimada).toBe('17:00')
  })
})

describe('calcHorarios() com hora extra — almoço e volta batidos', () => {
  it('com almoço batido, a extra desloca a saída', () => {
    applyPartialState({ entrada: '08:00', almoco: '12:00', horaExtra: 60 })
    calcHorarios()
    // volta sugerida 13:00 + 5h restantes (9h − 4h antes do almoço)
    expect(state._voltaSugerida).toBe('13:00')
    expect(state._saidaEstimada).toBe('18:00')
  })

  it('com volta batida, a extra desloca a saída', () => {
    applyPartialState({ entrada: '08:00', almoco: '12:00', volta: '13:00', horaExtra: 60 })
    calcHorarios()
    expect(state._saidaEstimada).toBe('18:00')
  })

  it('com volta batida e sem extra, a saída volta ao normal', () => {
    applyPartialState({ entrada: '08:00', almoco: '12:00', volta: '13:00', horaExtra: 0 })
    calcHorarios()
    expect(state._saidaEstimada).toBe('17:00')
  })

  it('saída já batida não é sobrescrita pela extra', () => {
    applyPartialState({
      entrada: '08:00', almoco: '12:00', volta: '13:00', saida: '17:00', horaExtra: 60,
    })
    calcHorarios()
    expect(state._saidaEstimada).toBeNull()
  })
})

/**
 * Regressão que segura o desenho inteiro: se alguém "simplificar" trocando
 * `settings.jornada` em vez de usar o delta, o dia de hora extra fecha com
 * saldo ZERO — matando exatamente a extra que o usuário foi fazer.
 */
describe('banco de horas não enxerga a hora extra do dia', () => {
  it('9h trabalhadas contra contrato de 8h = +60min de saldo', () => {
    const rec = buildDayRecord('2026-09-04', ['08:00', '12:00', '13:00', '18:00'], 480)
    expect(rec.workedMinutes).toBe(540)
    expect(rec.balanceMinutes).toBe(60)
  })

  it('o previsto do dia continua sendo a jornada contratual', () => {
    applyPartialState({ entrada: '08:00', horaExtra: 120 })
    calcHorarios()
    // calcHorarios mexeu na saída estimada...
    expect(state._saidaEstimada).toBe('19:00')
    // ...e o saldo segue apurado contra as 8h do contrato.
    const rec = buildDayRecord('2026-09-04', ['08:00', '12:00', '13:00', '19:00'], 480)
    expect(rec.balanceMinutes).toBe(120)
  })
})

describe('resetState()', () => {
  it('"limpar registros de hoje" zera também a hora extra', () => {
    applyPartialState({ entrada: '08:00', horaExtra: 90 })
    calcHorarios()
    expect(state._saidaEstimada).toBe('18:30')

    resetState()
    expect(state.horaExtra).toBe(0)

    applyPartialState({ entrada: '08:00' })
    calcHorarios()
    expect(state._saidaEstimada).toBe('17:00')
  })
})
