import { describe, it, expect } from 'vitest';
import { getPaytrackStatus } from '../../lib/domain/paytrack-status';

describe('getPaytrackStatus', () => {
  it('dia 1 ao 3 mostram próximo prazo do mês corrente', () => {
    expect(getPaytrackStatus(new Date(2026, 4, 1))).toMatchObject({
      tone: 'normal',
      label: 'Próximo prazo: 10/mai',
      daysLeft: null,
    });
    expect(getPaytrackStatus(new Date(2026, 4, 3))).toMatchObject({
      tone: 'normal',
      label: 'Próximo prazo: 10/mai',
    });
  });

  it('dias 4-6 entram em attention (amarelo)', () => {
    expect(getPaytrackStatus(new Date(2026, 4, 4))).toEqual({
      tone: 'attention', label: 'Faltam 6 dias', daysLeft: 6,
    });
    expect(getPaytrackStatus(new Date(2026, 4, 5))).toEqual({
      tone: 'attention', label: 'Faltam 5 dias', daysLeft: 5,
    });
    expect(getPaytrackStatus(new Date(2026, 4, 6))).toEqual({
      tone: 'attention', label: 'Faltam 4 dias', daysLeft: 4,
    });
  });

  it('dias 7-9 entram em warning (laranja)', () => {
    expect(getPaytrackStatus(new Date(2026, 4, 7))).toEqual({
      tone: 'warning', label: 'Faltam 3 dias', daysLeft: 3,
    });
    expect(getPaytrackStatus(new Date(2026, 4, 8))).toEqual({
      tone: 'warning', label: 'Faltam 2 dias', daysLeft: 2,
    });
    expect(getPaytrackStatus(new Date(2026, 4, 9))).toEqual({
      tone: 'warning', label: 'Falta 1 dia', daysLeft: 1,
    });
  });

  it('dia 10 é urgent (vermelho)', () => {
    expect(getPaytrackStatus(new Date(2026, 4, 10))).toEqual({
      tone: 'urgent', label: 'ÚLTIMO DIA', daysLeft: 0,
    });
  });

  it('dia 11 já aponta pro próximo mês', () => {
    expect(getPaytrackStatus(new Date(2026, 4, 11))).toMatchObject({
      tone: 'normal',
      label: 'Próximo prazo: 10/jun',
      daysLeft: null,
    });
  });

  it('dia 25 do mês fica calmo apontando pro próximo dia 10', () => {
    expect(getPaytrackStatus(new Date(2026, 4, 25))).toMatchObject({
      tone: 'normal',
      label: 'Próximo prazo: 10/jun',
    });
  });

  it('vira o ano corretamente — 11/dez aponta pro 10/jan', () => {
    expect(getPaytrackStatus(new Date(2026, 11, 11))).toMatchObject({
      tone: 'normal',
      label: 'Próximo prazo: 10/jan',
    });
  });

  it('último dia do mês aponta pro próximo dia 10', () => {
    expect(getPaytrackStatus(new Date(2026, 4, 31))).toMatchObject({
      tone: 'normal',
      label: 'Próximo prazo: 10/jun',
    });
  });
});
