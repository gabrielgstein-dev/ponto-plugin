import type { IPunchProvider } from '../domain/interfaces';
import type { PunchState, Settings } from '../domain/types';
import { DEFAULT_STATE, DEFAULT_SETTINGS } from '../domain/types';
import { timeToMinutes, getNowMinutes } from '../domain/time-utils';
import { ENABLE_SENIOR_INTEGRATION, ENABLE_MANUAL_PUNCH, ENABLE_NOTIFICATIONS, ENABLE_META_TIMESHEET } from '../domain/build-flags';
import { PunchDetector } from './detect-punches';
import { getCompanyPunchProviders, getTimesheetProvider } from '#company/providers';
import { SeniorStoragePunchProvider } from '../infrastructure/senior/senior-storage-provider';
import { SeniorApiPunchProvider } from '../infrastructure/senior/senior-api-provider';
import { SeniorScraperProvider } from '../infrastructure/senior/senior-scraper';
import { ManualPunchProvider } from '../infrastructure/manual/manual-punch-provider';
import { scheduleNotifications } from './schedule-notifications';
import { scheduleTsNotifications } from './schedule-ts-notifications';
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

  const hadEntrada = !!savedState.entrada;
  const hadVolta = !!savedState.volta;

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

  if (ENABLE_META_TIMESHEET) {
    const saidaEstMin = timeToMinutes(state._saidaEstimada);
    scheduleTsNotifications(
      timeToMinutes(state.entrada),
      timeToMinutes(state.volta),
      saidaEstMin,
      !hadEntrada && !!state.entrada,
      !hadVolta && !!state.volta,
    );
  }

  return true;
}

export function resetBackgroundHash(): void {
  _lastHash = '';
}

export async function notifyPendingTimesheet(): Promise<void> {
  try {
    const provider = getTimesheetProvider();
    const isOk = await provider.isAvailable();
    if (!isOk) return;
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const summary = await provider.getSummary(period);
    if (!summary) return;
    const pendingNoObs = summary.entries.filter(e => e.status === 'PENDING' && !e.observation);
    if (pendingNoObs.length === 0) return;
    const url = `ts-notification.html?count=${pendingNoObs.length}`;
    const width = 420;
    const height = 300;
    const currentWin = await chrome.windows.getCurrent();
    const left = Math.round((currentWin.left ?? 0) + ((currentWin.width ?? 1920) - width) / 2);
    const top = Math.round((currentWin.top ?? 0) + ((currentWin.height ?? 1080) - height) / 2);
    chrome.windows.create({ url, type: 'popup', width, height, left, top, focused: true }, (win) => {
      if (win?.id) chrome.storage.local.set({ tsNotifWindowId: win.id });
    });
    console.log(`[Senior Ponto] Popup timesheet: ${pendingNoObs.length} pendente(s) sem obs`);
  } catch (e) {
    console.warn('[Senior Ponto] notifyPendingTimesheet erro:', (e as Error).message);
  }
}
