import type { IPunchProvider } from '../domain/interfaces';
import type { PunchState, Settings } from '../domain/types';
import { DEFAULT_STATE, DEFAULT_SETTINGS } from '../domain/types';
import { timeToMinutes, getNowMinutes } from '../domain/time-utils';
import { ENABLE_SENIOR_INTEGRATION, ENABLE_MANUAL_PUNCH, ENABLE_NOTIFICATIONS } from '../domain/build-flags';
import { PunchDetector } from './detect-punches';
import { getCompanyPunchProviders } from '#company/providers';
import { SeniorStoragePunchProvider } from '../infrastructure/senior/senior-storage-provider';
import { SeniorApiPunchProvider } from '../infrastructure/senior/senior-api-provider';
import { SeniorScraperProvider } from '../infrastructure/senior/senior-scraper';
import { ManualPunchProvider } from '../infrastructure/manual/manual-punch-provider';
import { scheduleNotifications } from './schedule-notifications';
import { applyPartialState, applySettings, state, settings, resetNotifScheduled } from './state';
import { calcHorarios } from './calc-schedule';

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
let _lastHash = '';

export async function backgroundDetect(): Promise<boolean> {
  const data = await chrome.storage.local.get(['pontoState', 'pontoSettings', 'pontoDate']);
  const today = new Date().toDateString();

  let savedState: PunchState = { ...DEFAULT_STATE };
  let savedSettings: Settings = { ...DEFAULT_SETTINGS };

  if (data.pontoDate === today && data.pontoState) {
    savedState = { ...savedState, ...data.pontoState };
  }
  if (data.pontoSettings) {
    savedSettings = { ...savedSettings, ...data.pontoSettings };
  }

  applyPartialState(savedState);
  applySettings(savedSettings);

  const result = await detector.detect(new Date(), true);
  if (!result || result.times.length === 0) return false;

  const hash = result.times.join(',');
  if (hash === _lastHash) return false;
  _lastHash = hash;

  const nowMin = getNowMinutes();
  const past = result.times.filter(t => (timeToMinutes(t) ?? 9999) <= nowMin + 5);
  if (past.length === 0) return false;

  const currentSlots = [state.entrada, state.almoco, state.volta, state.saida].filter(Boolean).length;
  if (past.length < currentSlots) return false;

  state.entrada = past[0];
  state.almoco = null;
  state.volta = null;
  state.saida = null;

  if (past.length >= 2) {
    const entradaMin = timeToMinutes(past[0])!;
    let assigned = false;

    for (let i = 1; i < past.length - 1; i++) {
      const tMin = timeToMinutes(past[i])!;
      const tNextMin = timeToMinutes(past[i + 1])!;
      const gap = tNextMin - tMin;
      const workBefore = tMin - entradaMin;

      if (workBefore >= 120 && gap >= Math.min(settings.almocoDur, 30)) {
        state.almoco = past[i];
        state.volta = past[i + 1];
        if (i + 2 < past.length) state.saida = past[past.length - 1];
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      const lastPunch = past[past.length - 1];
      const lastMin = timeToMinutes(lastPunch)!;
      const totalSpan = lastMin - entradaMin;

      if (totalSpan >= 120 && totalSpan < settings.jornada + settings.almocoDur) {
        state.almoco = lastPunch;
      }
    }
  }

  calcHorarios();

  await chrome.storage.local.set({ pontoState: state, pontoDate: today });
  resetNotifScheduled();

  if (ENABLE_NOTIFICATIONS) {
    scheduleNotifications(
      timeToMinutes(state.entrada),
      timeToMinutes(state.almoco),
      timeToMinutes(state.volta),
      timeToMinutes(state.saida),
    );
  }

  console.log('[Senior Ponto] Background detect: state atualizado', {
    entrada: state.entrada, almoco: state.almoco, volta: state.volta, saida: state.saida,
  });

  return true;
}

export function resetBackgroundHash(): void {
  _lastHash = '';
}
