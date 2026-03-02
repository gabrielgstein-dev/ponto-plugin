import { useState, useEffect, useCallback } from 'react';
import type { TimesheetSummary, TimesheetEntry } from '../../domain/types';
import { ENABLE_META_TIMESHEET } from '../../domain/build-flags';
import { getTimesheetProvider, getWorkedHoursForDate } from '#company/providers';

function getCurrentPeriod(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodLabel(period: string): string {
  const [y, m] = period.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

export function useTimesheetData() {
  const [summary, setSummary] = useState<TimesheetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(false);
  const [periodOffset, setPeriodOffset] = useState(0);

  const period = getCurrentPeriod(periodOffset);
  const periodLabel = formatPeriodLabel(period);

  const loadData = useCallback(async () => {
    if (!ENABLE_META_TIMESHEET) return;
    setLoading(true);
    try {
      const provider = getTimesheetProvider();
      const isOk = await provider.isAvailable();
      setAvailable(isOk);
      if (!isOk) {
        setSummary(null);
        setLoading(false);
        return;
      }
      const result = await provider.getSummary(period);
      setSummary(result);
    } catch (e) {
      console.warn('[Senior Ponto] Timesheet load error:', (e as Error).message);
      setSummary(null);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.metaTsToken || changes.metaTsUserId) loadData();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [loadData]);

  const updateEntry = useCallback(async (entry: TimesheetEntry, observation: string): Promise<{ ok: boolean; gpHours: number | null }> => {
    if (!ENABLE_META_TIMESHEET) return { ok: false, gpHours: null };
    const dateOnly = entry.date.includes('T') ? entry.date.split('T')[0] : entry.date;
    const gpHours = await getWorkedHoursForDate(dateOnly);
    const hourQuantity = gpHours ?? entry.hourQuantity;
    console.log(`[Senior Ponto] updateEntry: TS=${entry.hourQuantity.toFixed(2)}h GP=${gpHours?.toFixed(2) ?? 'N/A'} → usando ${hourQuantity.toFixed(2)}h`);
    const provider = getTimesheetProvider();
    const ok = await provider.updateEntry(entry.id, entry, { observation, hourQuantity });
    if (ok && summary) {
      setSummary({
        ...summary,
        entries: summary.entries.map(e => e.id === entry.id ? { ...e, observation, hourQuantity } : e),
      });
    }
    return { ok, gpHours };
  }, [summary]);

  const fetchGpHours = useCallback(async (dateStr: string): Promise<number | null> => {
    return getWorkedHoursForDate(dateStr);
  }, []);

  const goToPrev = useCallback(() => setPeriodOffset(o => o - 1), []);
  const goToNext = useCallback(() => setPeriodOffset(o => Math.min(o + 1, 0)), []);
  const goToCurrent = useCallback(() => setPeriodOffset(0), []);
  const isCurrentPeriod = periodOffset === 0;

  return { summary, loading, available, period, periodLabel, isCurrentPeriod, goToPrev, goToNext, goToCurrent, refresh: loadData, updateEntry, fetchGpHours };
}
