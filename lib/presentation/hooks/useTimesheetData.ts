import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimesheetSummary, TimesheetEntry } from '../../domain/types';
import { ENABLE_META_TIMESHEET } from '../../domain/build-flags';
import { debugLog, debugWarn } from '../../domain/debug';
import { getCurrentTimesheetPeriod } from '../../domain/timesheet-period';
import { getTimesheetProvider, getWorkedHoursForDate } from '#company/providers';

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
  const syncRequestedRef = useRef(false);
  const hasCacheRef = useRef(false);

  const period = getCurrentTimesheetPeriod(periodOffset);
  const periodLabel = formatPeriodLabel(period);

  useEffect(() => {
    if (!ENABLE_META_TIMESHEET) return;
    chrome.storage.local.get('timesheetSummaryCache').then((data) => {
      if (data.timesheetSummaryCache) {
        const cached = data.timesheetSummaryCache as TimesheetSummary;
        if (cached.period === period) {
          setSummary(cached);
          setAvailable(true);
          hasCacheRef.current = true;
          debugLog('Timesheet: carregado do cache do background');
        }
      }
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!ENABLE_META_TIMESHEET) return;
    setLoading(true);
    try {
      const provider = getTimesheetProvider();
      const isOk = await provider.isAvailable();
      if (!isOk) {
        if (!hasCacheRef.current) setAvailable(false);
        setLoading(false);
        if (!syncRequestedRef.current) {
          syncRequestedRef.current = true;
          if (!hasCacheRef.current) setConnecting(true);
          // BUG 2: dá no máximo 3s pra connecting silencioso. Se o sync não
          // resolver nesse tempo, mostra o ReconnectCard pra ação explícita.
          // Se o sync funcionar antes disso, o storage listener (timesheetSummaryCache
          // ou metaTsToken) vai disparar loadData() de novo e vir tudo OK.
          const timeoutId = setTimeout(() => setConnecting(false), 3_000);
          chrome.runtime
            .sendMessage({ type: 'REQUEST_TS_SYNC' })
            .catch(() => {})
            .finally(() => {
              clearTimeout(timeoutId);
              setConnecting(false);
            });
        }
        return;
      }
      setAvailable(isOk);
      syncRequestedRef.current = false;
      setConnecting(false);
      // Delega ao service worker pra evitar abas paralelas (sidepanel +
      // background criando aba ao mesmo tempo). Background tem mutex de
      // módulo natural — apenas 1 contexto criando aba.
      const response = await chrome.runtime.sendMessage({ type: 'TS_GET_SUMMARY', period }).catch(() => null) as
        | { ok: boolean; summary?: TimesheetSummary }
        | null;
      const result = response?.ok ? response.summary : undefined;
      if (result) {
        setSummary(result);
        hasCacheRef.current = true;
        // Background já persistiu em storage; sidepanel só atualiza state local.
      }
    } catch (e) {
      debugWarn('Timesheet load error:', (e as Error).message);
      if (!hasCacheRef.current) setSummary(null);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.metaTsToken) {
        // Só recarrega quando o token aparece (era ausente) ou some (era presente).
        // Renovações silenciosas (presente → presente diferente) não exigem reload —
        // evita o loop onde fetchViaMetaTab captura novo JWT via webRequest e
        // dispara loadData() repetidamente.
        const hadToken = !!changes.metaTsToken.oldValue;
        const hasToken = !!changes.metaTsToken.newValue;
        if (hadToken !== hasToken) loadData();
      }
      if (changes.metaTsUserId) loadData();
      if (changes.timesheetSummaryCache?.newValue) {
        const cached = changes.timesheetSummaryCache.newValue as TimesheetSummary;
        if (cached.period === period) {
          setSummary(cached);
          setAvailable(true);
          setConnecting(false);
          syncRequestedRef.current = false;
        }
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [loadData, period]);

  const updateEntry = useCallback(async (entry: TimesheetEntry, observation: string, manualHours?: number): Promise<{ ok: boolean; gpHours: number | null }> => {
    if (!ENABLE_META_TIMESHEET) return { ok: false, gpHours: null };
    const dateOnly = entry.date.includes('T') ? entry.date.split('T')[0] : entry.date;
    const gpHours = await getWorkedHoursForDate(dateOnly);
    
    const hasMultipleCostCenters = entry.costCenters && entry.costCenters.length > 1;
    
    let hourQuantity: number;
    if (hasMultipleCostCenters) {
      if (manualHours === undefined) {
        debugWarn('updateEntry: múltiplos centros de custo, mas horas não fornecidas');
        return { ok: false, gpHours };
      }
      if (gpHours !== null && manualHours > gpHours) {
        debugWarn(`updateEntry: horas manuais (${manualHours}) excedem GP (${gpHours})`);
        return { ok: false, gpHours };
      }
      hourQuantity = manualHours;
    } else {
      hourQuantity = gpHours ?? entry.hourQuantity;
    }
    
    debugLog(`updateEntry: TS=${entry.hourQuantity.toFixed(2)}h GP=${gpHours?.toFixed(2) ?? 'N/A'} → usando ${hourQuantity.toFixed(2)}h (manual: ${hasMultipleCostCenters})`);
    const response = await chrome.runtime.sendMessage({
      type: 'TS_UPDATE_ENTRY',
      entryId: entry.id,
      entry,
      body: { observation, hourQuantity },
    }).catch(() => null) as { ok: boolean } | null;
    const ok = !!response?.ok;
    if (ok && summary) {
      setSummary({
        ...summary,
        entries: summary.entries.map(e => e.id === entry.id ? { ...e, observation, hourQuantity } : e),
      });
    }
    return { ok, gpHours };
  }, [summary]);

  const updateEntryWithAllocations = useCallback(async (entry: TimesheetEntry, allocations: import('../../domain/types').CostCenterAllocation[]): Promise<{ ok: boolean; gpHours: number | null }> => {
    if (!ENABLE_META_TIMESHEET) return { ok: false, gpHours: null };
    const dateOnly = entry.date.includes('T') ? entry.date.split('T')[0] : entry.date;
    const gpHours = await getWorkedHoursForDate(dateOnly);
    
    const totalHours = allocations.reduce((sum, a) => sum + a.hours, 0);
    
    if (gpHours !== null && totalHours > gpHours) {
      debugWarn(`updateEntryWithAllocations: total (${totalHours}) excede GP (${gpHours})`);
      return { ok: false, gpHours };
    }
    
    const observation = allocations.map(a => 
      `${a.costCenter.code}: ${a.hours}h${a.observation ? ` - ${a.observation}` : ''}`
    ).join('\n');
    
    debugLog(`updateEntryWithAllocations: ${allocations.length} alocações, total ${totalHours.toFixed(2)}h`);
    const response = await chrome.runtime.sendMessage({
      type: 'TS_UPDATE_ENTRY',
      entryId: entry.id,
      entry,
      body: { observation, hourQuantity: totalHours },
    }).catch(() => null) as { ok: boolean } | null;
    const ok = !!response?.ok;
    if (ok && summary) {
      setSummary({
        ...summary,
        entries: summary.entries.map(e => e.id === entry.id ? { ...e, observation, hourQuantity: totalHours } : e),
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

  return { summary, loading, available, connecting, period, periodLabel, isCurrentPeriod, goToPrev, goToNext, goToCurrent, refresh: loadData, updateEntry, updateEntryWithAllocations, fetchGpHours };
}
