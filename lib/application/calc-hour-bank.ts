import type { DayRecord, HourBankBalance } from '../domain/types';
import { padZero } from '../domain/time-utils';

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function calcWorkedMinutes(punches: string[]): number {
  if (punches.length < 2) return 0;
  const sorted = [...punches].sort();
  let total = 0;
  for (let i = 0; i < sorted.length - 1; i += 2) {
    total += timeToMin(sorted[i + 1]) - timeToMin(sorted[i]);
  }
  return Math.max(0, total);
}

export function buildDayRecord(date: string, punches: string[], jornadaMinutes: number): DayRecord {
  const workedMinutes = calcWorkedMinutes(punches);
  return {
    date,
    punches,
    workedMinutes,
    balanceMinutes: workedMinutes - jornadaMinutes,
  };
}

export function buildDayRecords(
  punchMap: Record<string, string[]>,
  jornadaMinutes: number,
): DayRecord[] {
  return Object.entries(punchMap)
    .map(([date, punches]) => buildDayRecord(date, punches, jornadaMinutes))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function calcPeriodBalance(
  records: DayRecord[],
  carryOverMinutes: number,
): number {
  const periodBalance = records.reduce((sum, r) => sum + r.balanceMinutes, 0);
  return carryOverMinutes + periodBalance;
}

export function getPeriodDates(closingDay: number, referenceDate: Date = new Date()): { start: string; end: string } {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const d = referenceDate.getDate();

  let startDate: Date;
  let endDate: Date;

  if (d > closingDay) {
    startDate = new Date(y, m, closingDay + 1);
    endDate = new Date(y, m + 1, closingDay);
  } else {
    startDate = new Date(y, m - 1, closingDay + 1);
    endDate = new Date(y, m, closingDay);
  }

  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${padZero(dt.getMonth() + 1)}-${padZero(dt.getDate())}`;

  return { start: fmt(startDate), end: fmt(endDate) };
}

export function calcZeroBankExitTime(estimatedExit: string | null, bankMinutes: number): string | null {
  if (!estimatedExit || bankMinutes <= 0) return null;
  const exitMin = timeToMin(estimatedExit);
  const adjusted = exitMin - bankMinutes;
  if (adjusted < 0) return null;
  const h = Math.floor(adjusted / 60) % 24;
  const m = adjusted % 60;
  return `${padZero(h)}:${padZero(m)}`;
}

export function isPeriodClosed(periodEnd: string, today: string): boolean {
  return today > periodEnd;
}

export function buildBalance(
  records: DayRecord[],
  carryOverMinutes: number,
  periodStart: string,
  periodEnd: string,
): HourBankBalance {
  return {
    totalMinutes: calcPeriodBalance(records, carryOverMinutes),
    periodStart,
    periodEnd,
    carryOverMinutes,
  };
}
