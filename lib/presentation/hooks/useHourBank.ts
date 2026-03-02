import { useState, useEffect, useCallback, useRef } from 'react';
import type { HourBankBalance, Settings } from '../../domain/types';
import type { IHourBankProvider } from '../../domain/interfaces';
import { checkAndClosePeriod } from '../../application/manage-period';

export function useHourBank(provider: IHourBankProvider | null, settings: Settings) {
  const [balance, setBalance] = useState<HourBankBalance | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const refresh = useCallback(async () => {
    if (!provider) return;
    const s = settingsRef.current;
    await provider.ensureInitialized(s.closingDay);
    await checkAndClosePeriod(provider, s);
    const updated = await provider.recalculate(s);
    setBalance(updated);
  }, [provider]);

  useEffect(() => { refresh(); }, [refresh]);

  return { balance, refresh };
}
