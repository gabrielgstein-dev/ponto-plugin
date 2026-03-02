import type { Settings, HourBankBalance } from '../domain/types';
import type { IHourBankProvider } from '../domain/interfaces';
import { getPeriodDates, isPeriodClosed } from './calc-hour-bank';
import { todayDateStr } from '../domain/time-utils';

export async function checkAndClosePeriod(
  provider: IHourBankProvider,
  settings: Settings,
): Promise<{ closed: boolean; balance: HourBankBalance }> {
  const balance = await provider.getBalance();
  if (!balance) return { closed: false, balance: buildInitialBalance(settings.closingDay) };

  const today = todayDateStr();
  const { start: expectedStart } = getPeriodDates(settings.closingDay);

  if (isPeriodClosed(balance.periodEnd, today) && balance.periodStart !== expectedStart) {
    const newBalance = await provider.closePeriod(settings);
    return { closed: true, balance: newBalance };
  }

  return { closed: false, balance };
}

export function buildInitialBalance(closingDay: number): HourBankBalance {
  const { start, end } = getPeriodDates(closingDay);
  return {
    totalMinutes: 0,
    periodStart: start,
    periodEnd: end,
    carryOverMinutes: 0,
  };
}
