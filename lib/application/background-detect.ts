import type { IPunchProvider } from '../domain/interfaces';
import type { PunchState, Settings } from '../domain/types';
import { DEFAULT_STATE, DEFAULT_SETTINGS } from '../domain/types';
import { timeToMinutes, getNowMinutes } from '../domain/time-utils';
import { ENABLE_SENIOR_INTEGRATION, ENABLE_MANUAL_PUNCH, ENABLE_NOTIFICATIONS, ENABLE_META_TIMESHEET } from '../domain/build-flags';
import { debugLog, debugWarn } from '../domain/debug';
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
  debugLog('backgroundDetect: iniciando...');
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
  if (!result || result.times.length === 0) {
    debugLog('backgroundDetect: detector não retornou batimentos');
    return false;
  }
  debugLog(`backgroundDetect: detector retornou ${result.times.length} batimentos de ${result.source}`);

  const hash = result.times.join(',');
  if (hash === _lastHash) {
    debugLog('backgroundDetect: hash igual ao anterior, sem mudanças');
    return false;
  }
  debugLog(`backgroundDetect: hash mudou (anterior: ${_lastHash.substring(0, 30)}, novo: ${hash.substring(0, 30)})`);
  _lastHash = hash;

  const nowMin = getNowMinutes();
  const past = result.times.filter(t => (timeToMinutes(t) ?? 9999) <= nowMin + 5);
  if (past.length === 0) {
    debugLog('backgroundDetect: nenhum batimento no passado');
    return false;
  }
  debugLog(`backgroundDetect: ${past.length} batimentos no passado: ${past.join(', ')}`);

  const currentSlots = [state.entrada, state.almoco, state.volta, state.saida].filter(Boolean).length;
  if (past.length < currentSlots) {
    debugLog(`backgroundDetect: past.length (${past.length}) < currentSlots (${currentSlots}), ignorando`);
    return false;
  }
  debugLog(`backgroundDetect: aplicando ${past.length} batimentos ao estado...`);

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
  debugLog(`backgroundDetect: estado calculado - entrada=${state.entrada}, almoco=${state.almoco}, volta=${state.volta}, saida=${state.saida}`);

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

  debugLog('Background detect: state atualizado', {
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

const TS_AUTO_CONNECT_THROTTLE_MS = 30 * 60 * 1000;
const TS_AUTO_CONNECT_TIMEOUT_MS = 20000;
const META_PLATFORM_URL = 'https://plataforma.meta.com.br';

async function tsAutoConnect(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get('tsAutoConnectTs');
    const lastAttempt = stored.tsAutoConnectTs || 0;
    if (Date.now() - lastAttempt < TS_AUTO_CONNECT_THROTTLE_MS) {
      debugLog('TS auto-connect: throttled (último há <30min)');
      return false;
    }
    chrome.storage.local.set({ tsAutoConnectTs: Date.now() });
    debugLog('TS auto-connect: abrindo aba plataforma.meta.com.br...');

    const tab = await chrome.tabs.create({ url: META_PLATFORM_URL, active: false });
    const tabId = tab.id;
    const captured = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        chrome.storage.onChanged.removeListener(onChange);
        resolve(false);
      }, TS_AUTO_CONNECT_TIMEOUT_MS);

      function onChange(changes: Record<string, unknown>, area: string) {
        if (area === 'local' && (changes as any).metaTsToken) {
          clearTimeout(timeout);
          chrome.storage.onChanged.removeListener(onChange);
          resolve(true);
        }
      }
      chrome.storage.onChanged.addListener(onChange);
    });

    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch (_) {}
    }
    debugLog(`TS auto-connect: ${captured ? 'token capturado' : 'timeout'}`);
    return captured;
  } catch (e) {
    debugWarn('TS auto-connect erro:', (e as Error).message);
    return false;
  }
}

export async function backgroundTimesheetSync(): Promise<void> {
  if (!ENABLE_META_TIMESHEET) return;
  try {
    const provider = getTimesheetProvider();
    let isOk = await provider.isAvailable();
    if (!isOk) {
      debugLog('TS sync: sem token, tentando auto-connect...');
      const connected = await tsAutoConnect();
      if (connected) {
        isOk = await provider.isAvailable();
      }
      if (!isOk) return;
    }
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const summary = await provider.getSummary(period);
    if (summary) {
      chrome.storage.local.set({ timesheetSummaryCache: summary, timesheetSyncTs: Date.now() });
      debugLog(`TS sync: ${summary.entries.length} entries, ${summary.pendingHours}h pendentes`);
    }
  } catch (e) {
    debugWarn('TS sync erro:', (e as Error).message);
  }
}

export async function notifyPendingTimesheet(): Promise<void> {
  try {
    await backgroundTimesheetSync();
    const stored = await chrome.storage.local.get(['timesheetSummaryCache', 'tsNotifWindowId', 'pontoState']);
    const ps = stored.pontoState as { entrada?: string | null; saida?: string | null } | null;

    // Só exibe dentro da janela de trabalho: entrada registrada e saída ainda não batida
    if (!ps?.entrada || ps?.saida) return;

    const summary = stored.timesheetSummaryCache;
    if (!summary) return;
    const pendingNoObs = summary.entries.filter((e: any) => e.status === 'PENDING' && !e.observation);
    if (pendingNoObs.length === 0) return;
    const url = `ts-notification.html?count=${pendingNoObs.length}`;
    const width = 420;
    const height = 300;

    if (stored.tsNotifWindowId) {
      try { await chrome.windows.remove(stored.tsNotifWindowId); } catch (_) {}
    }

    const currentWin = await chrome.windows.getCurrent();
    const left = Math.round((currentWin.left ?? 0) + ((currentWin.width ?? 1920) - width) / 2);
    const top = Math.round((currentWin.top ?? 0) + ((currentWin.height ?? 1080) - height) / 2);
    chrome.windows.create({ url, type: 'popup', width, height, left, top, focused: true }, (win) => {
      if (win?.id) chrome.storage.local.set({ tsNotifWindowId: win.id });
    });
    debugLog(`Popup timesheet: ${pendingNoObs.length} pendente(s) sem obs`);
  } catch (e) {
    debugWarn('notifyPendingTimesheet erro:', (e as Error).message);
  }
}
