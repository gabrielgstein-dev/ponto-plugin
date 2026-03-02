import { useState, useEffect, useMemo, useCallback } from 'react';
import type { DayRecord, HourBankBalance, Settings } from '../../domain/types';
import { DEFAULT_SETTINGS } from '../../domain/types';
import { ManualHourBankProvider } from '../../infrastructure/manual/manual-hour-bank-provider';
import {
  saveManualPunchForDate,
  removeManualPunchForDate,
  updateManualPunchForDate,
} from '../../infrastructure/manual/manual-punch-provider';
import { ENABLE_SENIOR_INTEGRATION } from '../../domain/build-flags';
import { fetchGpHistoryForPeriod } from '../../infrastructure/senior/gp-history-provider';

export type SidePanelSource = 'gp' | 'manual';

export function useSidePanelData() {
  const provider = useMemo(() => new ManualHourBankProvider(), []);
  const [balance, setBalance] = useState<HourBankBalance | null>(null);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [source, setSource] = useState<SidePanelSource>('manual');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingRecords(true);
    if (ENABLE_SENIOR_INTEGRATION) {
      const gpResult = await fetchGpHistoryForPeriod(periodOffset);
      if (gpResult) {
        setBalance(gpResult.balance);
        setRecords(gpResult.records.reverse());
        setSource('gp');
        setLoadingRecords(false);
        return;
      }
    }

    const data = await chrome.storage.local.get(['pontoSettings']);
    const s: Settings = { ...DEFAULT_SETTINGS, ...data.pontoSettings };
    await provider.ensureInitialized(s.closingDay);
    const updated = await provider.recalculate(s);
    setBalance(updated);
    const recs = await provider.getHistory(updated.periodStart, updated.periodEnd, s.jornada);
    setRecords(recs.reverse());
    setSource('manual');
    setLoadingRecords(false);
  }, [provider, periodOffset]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.manualPunches || changes.pontoSettings || changes.hourBankBalance || changes.gpAssertion) loadData();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [loadData]);

  const editPunch = useCallback(async (date: string, oldTime: string, newTime: string) => {
    if (newTime && newTime !== oldTime) await updateManualPunchForDate(date, oldTime, newTime);
  }, []);

  const removePunch = useCallback(async (date: string, time: string) => {
    await removeManualPunchForDate(date, time);
  }, []);

  const addPunch = useCallback(async (date: string, time: string) => {
    if (time) await saveManualPunchForDate(date, time);
  }, []);

  const goToPrev = useCallback(() => setPeriodOffset(o => o - 1), []);
  const goToNext = useCallback(() => setPeriodOffset(o => Math.min(o + 1, 0)), []);
  const goToCurrent = useCallback(() => setPeriodOffset(0), []);
  const isCurrentPeriod = periodOffset === 0;

  return { balance, records, source, loadingRecords, isCurrentPeriod, goToPrev, goToNext, goToCurrent, editPunch, removePunch, addPunch };
}
