import { useState, useEffect, useCallback, useRef } from 'react';
import type { IStateRepository } from '../../domain/interfaces';
import type { IPunchProvider } from '../../domain/interfaces';
import { PunchDetector } from '../../application/detect-punches';
import { applyTimes, type ApplyTimesContext } from '../../application/apply-punches';
import { scheduleNotifications } from '../../application/schedule-notifications';
import { state } from '../../application/state';
import { timeToMinutes } from '../../domain/time-utils';
import { ENABLE_SENIOR_INTEGRATION, ENABLE_MANUAL_PUNCH, ENABLE_NOTIFICATIONS, APP_NAME } from '../../domain/build-flags';
import { GpPunchProvider } from '../../infrastructure/senior/gp-provider';
import { SeniorStoragePunchProvider } from '../../infrastructure/senior/senior-storage-provider';
import { SeniorApiPunchProvider } from '../../infrastructure/senior/senior-api-provider';
import { SeniorScraperProvider } from '../../infrastructure/senior/senior-scraper';
import { ManualPunchProvider } from '../../infrastructure/manual/manual-punch-provider';

function buildProviders(): IPunchProvider[] {
  const providers: IPunchProvider[] = [];
  if (ENABLE_MANUAL_PUNCH) providers.push(new ManualPunchProvider());
  if (ENABLE_SENIOR_INTEGRATION) {
    providers.push(new GpPunchProvider());
    providers.push(new SeniorApiPunchProvider());
    providers.push(new SeniorStoragePunchProvider());
    providers.push(new SeniorScraperProvider());
  }
  return providers;
}

const detector = new PunchDetector(buildProviders());

let lastPunchHash = '';

export function useAutoDetect(
  stateRepo: IStateRepository,
  onRender: () => void,
  onToast: (msg: string) => void,
) {
  const [detecting, setDetecting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval>>();
  const ctxRef = useRef<ApplyTimesContext>({ stateRepo, onRender, onToast });
  ctxRef.current = { stateRepo, onRender, onToast };

  const detect = useCallback(async (silent = true, aggressive = false) => {
    setDetecting(true);
    try {
      const result = await detector.detect(new Date(), aggressive);
      if (result) {
        const hash = result.times.join(',');
        if (hash !== lastPunchHash || !silent) {
          lastPunchHash = hash;
          const changed = applyTimes(result.times, result.source, silent, ctxRef.current);
          if (changed && ENABLE_NOTIFICATIONS) {
            scheduleNotifications(
              timeToMinutes(state.entrada),
              timeToMinutes(state.almoco),
              timeToMinutes(state.volta),
              timeToMinutes(state.saida),
            );
          }
        }
      } else if (!silent) {
        ctxRef.current.onToast('Nenhum batimento encontrado');
      }
    } catch (e) {
      if (!silent) ctxRef.current.onToast('Erro ao detectar batimentos');
    }
    setDetecting(false);
  }, []);

  useEffect(() => {
    console.log(`[${APP_NAME}] === BUILD v4 27/02 ===`);
    detect(true, true);
    pollingRef.current = setInterval(() => detect(true, false), 15000);

    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.punchSuccessTs) {
        console.log(`[${APP_NAME}] Ponto detectado! Atualizando em 2s...`);
        setTimeout(() => { lastPunchHash = ''; detect(true, true); }, 2000);
      }
    };
    chrome.storage.onChanged.addListener(onStorageChange);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      chrome.storage.onChanged.removeListener(onStorageChange);
    };
  }, [detect]);

  return { detecting, detect };
}
