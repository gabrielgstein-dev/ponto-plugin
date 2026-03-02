import type { IHourBankProvider } from '../../domain/interfaces';
import type { DayRecord, HourBankBalance, Settings } from '../../domain/types';
import { buildDayRecords, calcPeriodBalance, getPeriodDates, buildBalance } from '../../application/calc-hour-bank';
import { buildInitialBalance } from '../../application/manage-period';

const BALANCE_KEY = 'hourBankBalance';

export class ManualHourBankProvider implements IHourBankProvider {
  async getBalance(): Promise<HourBankBalance> {
    const data = await chrome.storage.local.get([BALANCE_KEY]);
    return data[BALANCE_KEY] ?? null;
  }

  async getHistory(from: string, to: string, jornadaMinutes?: number): Promise<DayRecord[]> {
    const data = await chrome.storage.local.get(['manualPunches', 'pontoSettings']);
    const punches: Record<string, string[]> = data.manualPunches || {};
    const jornada = jornadaMinutes ?? data.pontoSettings?.jornada ?? 480;

    const filtered: Record<string, string[]> = {};
    for (const [date, times] of Object.entries(punches)) {
      if (date >= from && date <= to) filtered[date] = times;
    }

    return buildDayRecords(filtered, jornada);
  }

  async recalculate(settings: Settings): Promise<HourBankBalance> {
    const stored = await this.getBalance();
    const balance = stored ?? buildInitialBalance(settings.closingDay);
    const records = await this.getHistory(balance.periodStart, balance.periodEnd, settings.jornada);
    const totalMinutes = calcPeriodBalance(records, balance.carryOverMinutes);

    const updated: HourBankBalance = { ...balance, totalMinutes };
    await chrome.storage.local.set({ [BALANCE_KEY]: updated });
    return updated;
  }

  async closePeriod(settings: Settings): Promise<HourBankBalance> {
    const oldBalance = await this.getBalance();
    const carryOver = oldBalance ? oldBalance.totalMinutes : 0;

    const { start, end } = getPeriodDates(settings.closingDay);

    if (oldBalance) {
      const data = await chrome.storage.local.get(['manualPunches']);
      const punches: Record<string, string[]> = data.manualPunches || {};
      for (const date of Object.keys(punches)) {
        if (date <= oldBalance.periodEnd) delete punches[date];
      }
      await chrome.storage.local.set({ manualPunches: punches });
    }

    const newBalance = buildBalance([], carryOver, start, end);
    const records = await this.getHistory(start, end);
    newBalance.totalMinutes = calcPeriodBalance(records, carryOver);

    await chrome.storage.local.set({ [BALANCE_KEY]: newBalance });
    return newBalance;
  }

  async ensureInitialized(closingDay: number): Promise<HourBankBalance> {
    const existing = await this.getBalance();
    if (existing) return existing;
    const balance = buildInitialBalance(closingDay);
    await chrome.storage.local.set({ [BALANCE_KEY]: balance });
    return balance;
  }
}
