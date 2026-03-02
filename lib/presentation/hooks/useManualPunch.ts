import { useState, useCallback } from 'react';
import { saveManualPunch } from '../../infrastructure/manual/manual-punch-provider';
import { padZero } from '../../domain/time-utils';

export function useManualPunch(onToast: (msg: string) => void, onRefresh: () => void) {
  const [punching, setPunching] = useState(false);

  const doPunch = useCallback(async () => {
    setPunching(true);
    try {
      const now = new Date();
      const time = `${padZero(now.getHours())}:${padZero(now.getMinutes())}`;
      await saveManualPunch(time);
      await chrome.storage.local.set({ punchSuccessTs: Date.now() });
      onToast(`Ponto registrado: ${time}`);
      onRefresh();
    } catch (e) {
      onToast('Erro ao registrar ponto');
    }
    setPunching(false);
  }, [onToast, onRefresh]);

  return { punching, doPunch };
}
