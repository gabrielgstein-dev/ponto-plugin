import { describe, it, expect } from 'vitest';
import { getInsiXStatus, getIsoWeekKey, hasRespondedThisWeek } from '../../lib/domain/insi-x-status';
import type { InsiXState } from '../../lib/domain/types';

const empty: InsiXState = { lastRespondedWeekKey: null, lastRespondedAt: null };

describe('getIsoWeekKey', () => {
  it('retorna chave ISO no formato YYYY-Www', () => {
    expect(getIsoWeekKey(new Date(2026, 4, 20))).toMatch(/^2026-W\d{2}$/);
  });

  it('dias da mesma semana ISO retornam mesma chave', () => {
    const seg = new Date(2026, 4, 18); // segunda
    const dom = new Date(2026, 4, 24); // domingo
    expect(getIsoWeekKey(seg)).toBe(getIsoWeekKey(dom));
  });

  it('semanas distintas retornam chaves distintas', () => {
    expect(getIsoWeekKey(new Date(2026, 4, 18))).not.toBe(getIsoWeekKey(new Date(2026, 4, 25)));
  });
});

describe('hasRespondedThisWeek', () => {
  it('false quando state vazio', () => {
    expect(hasRespondedThisWeek(empty, new Date(2026, 4, 20))).toBe(false);
  });

  it('true quando weekKey bate', () => {
    const now = new Date(2026, 4, 20);
    const state: InsiXState = { lastRespondedWeekKey: getIsoWeekKey(now), lastRespondedAt: Date.now() };
    expect(hasRespondedThisWeek(state, now)).toBe(true);
  });

  it('false quando weekKey é de semana passada', () => {
    const now = new Date(2026, 4, 27);
    const last = new Date(2026, 4, 20);
    const state: InsiXState = { lastRespondedWeekKey: getIsoWeekKey(last), lastRespondedAt: Date.now() };
    expect(hasRespondedThisWeek(state, now)).toBe(false);
  });
});

describe('getInsiXStatus', () => {
  // Maio/2026: dom=17, seg=18, ter=19, qua=20, qui=21, sex=22, sáb=23
  it('domingo: idle', () => {
    expect(getInsiXStatus(new Date(2026, 4, 17), empty)).toEqual({ tone: 'idle', label: '', shouldShow: false });
  });

  it('segunda: idle', () => {
    expect(getInsiXStatus(new Date(2026, 4, 18), empty)).toEqual({ tone: 'idle', label: '', shouldShow: false });
  });

  it('terça sem responder: attention', () => {
    expect(getInsiXStatus(new Date(2026, 4, 19), empty)).toEqual({ tone: 'attention', label: 'Adiantar?', shouldShow: true });
  });

  it('quarta sem responder: urgent', () => {
    expect(getInsiXStatus(new Date(2026, 4, 20), empty)).toEqual({ tone: 'urgent', label: 'Responda hoje', shouldShow: true });
  });

  it('quinta sem responder: idle (semana perdida)', () => {
    expect(getInsiXStatus(new Date(2026, 4, 21), empty)).toEqual({ tone: 'idle', label: '', shouldShow: false });
  });

  it('sexta sem responder: idle', () => {
    expect(getInsiXStatus(new Date(2026, 4, 22), empty)).toEqual({ tone: 'idle', label: '', shouldShow: false });
  });

  it('terça respondida na semana: done', () => {
    const now = new Date(2026, 4, 19);
    const state: InsiXState = { lastRespondedWeekKey: getIsoWeekKey(now), lastRespondedAt: Date.now() };
    expect(getInsiXStatus(now, state)).toEqual({ tone: 'done', label: 'Respondido ✓', shouldShow: true });
  });

  it('quarta respondida: done', () => {
    const now = new Date(2026, 4, 20);
    const state: InsiXState = { lastRespondedWeekKey: getIsoWeekKey(now), lastRespondedAt: Date.now() };
    expect(getInsiXStatus(now, state)).toEqual({ tone: 'done', label: 'Respondido ✓', shouldShow: true });
  });

  it('sexta respondida: idle (some após quarta)', () => {
    const now = new Date(2026, 4, 22);
    const state: InsiXState = { lastRespondedWeekKey: getIsoWeekKey(now), lastRespondedAt: Date.now() };
    expect(getInsiXStatus(now, state)).toEqual({ tone: 'idle', label: '', shouldShow: false });
  });

  it('sábado respondido: idle (some)', () => {
    const now = new Date(2026, 4, 23);
    const state: InsiXState = { lastRespondedWeekKey: getIsoWeekKey(now), lastRespondedAt: Date.now() };
    expect(getInsiXStatus(now, state)).toEqual({ tone: 'idle', label: '', shouldShow: false });
  });

  it('terça da semana seguinte ressetta: attention', () => {
    const prev = new Date(2026, 4, 20);
    const tue = new Date(2026, 4, 26);
    const state: InsiXState = { lastRespondedWeekKey: getIsoWeekKey(prev), lastRespondedAt: Date.now() };
    expect(getInsiXStatus(tue, state)).toEqual({ tone: 'attention', label: 'Adiantar?', shouldShow: true });
  });
});
