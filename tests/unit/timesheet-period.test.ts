import { describe, it, expect } from 'vitest';
import { getCurrentTimesheetPeriod } from '../../lib/domain/timesheet-period';

describe('getCurrentTimesheetPeriod', () => {
  it('dias 1..25 ficam no mês corrente', () => {
    expect(getCurrentTimesheetPeriod(0, new Date(2026, 3, 1))).toBe('2026-04');
    expect(getCurrentTimesheetPeriod(0, new Date(2026, 3, 25))).toBe('2026-04');
  });

  it('dias 26..fim viram pro próximo mês', () => {
    expect(getCurrentTimesheetPeriod(0, new Date(2026, 3, 26))).toBe('2026-05');
    expect(getCurrentTimesheetPeriod(0, new Date(2026, 3, 28))).toBe('2026-05');
    expect(getCurrentTimesheetPeriod(0, new Date(2026, 3, 30))).toBe('2026-05');
  });

  it('respeita virada de ano', () => {
    expect(getCurrentTimesheetPeriod(0, new Date(2026, 11, 26))).toBe('2027-01');
    expect(getCurrentTimesheetPeriod(0, new Date(2026, 11, 25))).toBe('2026-12');
  });

  it('aplica offset depois do shift fiscal', () => {
    expect(getCurrentTimesheetPeriod(-1, new Date(2026, 3, 28))).toBe('2026-04');
    expect(getCurrentTimesheetPeriod(1, new Date(2026, 3, 28))).toBe('2026-06');
    expect(getCurrentTimesheetPeriod(-1, new Date(2026, 3, 15))).toBe('2026-03');
  });
});
