import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimesheetSummary, TimesheetEntry } from '../../domain/types';
import { ENABLE_META_TIMESHEET } from '../../domain/build-flags';
import { debugLog, debugWarn } from '../../domain/debug';
import { getTimesheetProvider, getWorkedHoursForDate } from '#company/providers';

const META_PLATFORM_URL = 'https://plataforma.meta.com.br';
const AUTO_CONNECT_TIMEOUT_MS = 20000;

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
  const [connecting, setConnecting] = useState(false);
  const [periodOffset, setPeriodOffset] = useState(0);
  const autoConnectTriedRef = useRef(false);

  const period = getCurrentPeriod(periodOffset);
  const periodLabel = formatPeriodLabel(period);

  const autoConnect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    debugLog('Timesheet: auto-connect, abrindo aba plataforma.meta.com.br...');
    let tabId: number | undefined;
    try {
      const tab = await chrome.tabs.create({ url: META_PLATFORM_URL, active: false });
      tabId = tab.id;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          debugLog('Timesheet: auto-connect timeout');
          resolve();
        }, AUTO_CONNECT_TIMEOUT_MS);

        const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
          if (area === 'local' && changes.metaTsToken?.newValue) {
            debugLog('Timesheet: token capturado via auto-connect!');
            clearTimeout(timeout);
            chrome.storage.onChanged.removeListener(onChange);
            resolve();
          }
        };
        chrome.storage.onChanged.addListener(onChange);
      });
    } catch (e) {
      debugWarn('Timesheet auto-connect erro:', (e as Error).message);
    }
    if (tabId) {
      try { chrome.tabs.remove(tabId); } catch (_) {}
    }
    setConnecting(false);
  }, [connecting]);

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
        if (!autoConnectTriedRef.current) {
          autoConnectTriedRef.current = true;
          autoConnect().then(() => loadData());
        }
        return;
      }
      autoConnectTriedRef.current = false;
      const result = await provider.getSummary(period);
      setSummary(result);
      if (result) {
        chrome.storage.local.set({ timesheetSummaryCache: result });
      }
    } catch (e) {
      debugWarn('Timesheet load error:', (e as Error).message);
      setSummary(null);
    }
    setLoading(false);
  }, [period, autoConnect]);

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
    debugLog(`updateEntry: TS=${entry.hourQuantity.toFixed(2)}h GP=${gpHours?.toFixed(2) ?? 'N/A'} → usando ${hourQuantity.toFixed(2)}h`);
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

  return { summary, loading, available, connecting, period, periodLabel, isCurrentPeriod, goToPrev, goToNext, goToCurrent, refresh: loadData, updateEntry, fetchGpHours };
}
