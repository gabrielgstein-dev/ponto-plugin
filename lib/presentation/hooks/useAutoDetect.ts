import { useState, useEffect, useCallback, useRef } from 'react';
import type { IStateRepository } from '../../domain/interfaces';
import type { IPunchProvider } from '../../domain/interfaces';
import { PunchDetector, addPendingPunch } from '../../application/detect-punches';
import { applyTimes, type ApplyTimesContext } from '../../application/apply-punches';
import { scheduleNotifications } from '../../application/schedule-notifications';
import { applyPartialState, state } from '../../application/state';
import { calcHorarios } from '../../application/calc-schedule';
import { timeToMinutes } from '../../domain/time-utils';
import { ENABLE_SENIOR_INTEGRATION, ENABLE_MANUAL_PUNCH, ENABLE_NOTIFICATIONS, APP_NAME } from '../../domain/build-flags';
import { getCompanyPunchProviders } from '#company/providers';
import { SeniorStoragePunchProvider } from '../../infrastructure/senior/senior-storage-provider';
import { SeniorApiPunchProvider } from '../../infrastructure/senior/senior-api-provider';
import { SeniorScraperProvider } from '../../infrastructure/senior/senior-scraper';
import { ManualPunchProvider } from '../../infrastructure/manual/manual-punch-provider';
import { resetGpPunchCache } from '#company/providers';

function buildProviders(): IPunchProvider[] {
  const providers: IPunchProvider[] = [];
  if (ENABLE_MANUAL_PUNCH) providers.push(new ManualPunchProvider());
  if (ENABLE_SENIOR_INTEGRATION) {
    providers.push(...getCompanyPunchProviders());
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
      if (area !== 'local') return;
      if (changes.punchSuccessTs) {
        const punchTime = changes.punchSuccessTime?.newValue as string | undefined;
        const now = new Date();
        const fallback = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const time = punchTime || fallback;
        console.log(`[${APP_NAME}] Ponto registrado! Pending: ${time}. Re-detectando em 2s, 6s e 15s...`);
        addPendingPunch(time);
        resetGpPunchCache();
        lastPunchHash = '';
        [2000, 6000, 15000].forEach(delay => {
          setTimeout(() => { lastPunchHash = ''; detect(true, true); }, delay);
        });
      }
      if (changes.pontoState?.newValue) {
        const remote = changes.pontoState.newValue;
        const local = JSON.stringify({ e: state.entrada, a: state.almoco, v: state.volta, s: state.saida });
        const incoming = JSON.stringify({ e: remote.entrada, a: remote.almoco, v: remote.volta, s: remote.saida });
        if (local !== incoming) {
          console.log(`[${APP_NAME}] State sync do background`);
          applyPartialState(remote);
          calcHorarios();
          ctxRef.current.onRender();
        }
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
