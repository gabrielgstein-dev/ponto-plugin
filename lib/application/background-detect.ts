import type { IPunchProvider } from '../domain/interfaces';
import type { PunchState, Settings, TimesheetSummary } from '../domain/types';
import { DEFAULT_STATE, DEFAULT_SETTINGS } from '../domain/types';
import { timeToMinutes, getNowMinutes } from '../domain/time-utils';
import { isReminderBlockedToday } from '../domain/weekday-gate';
import { ENABLE_SENIOR_INTEGRATION, ENABLE_MANUAL_PUNCH, ENABLE_NOTIFICATIONS, ENABLE_META_TIMESHEET } from '../domain/build-flags';
import { isTimesheetEnabled } from '../domain/timesheet-gate';
import { debugLog, debugWarn } from '../domain/debug';
import { formatDuration, formatJwtExp, decodeJwtPayload } from '../domain/jwt-utils';
import { getCurrentTimesheetPeriod } from '../domain/timesheet-period';
import { PunchDetector } from './detect-punches';
import { getCompanyPunchProviders, getTimesheetProvider } from '#company/providers';
import { getMetaTsTokenSilently } from '../infrastructure/meta/timesheet/meta-ts-session';
import { metaTsAuth } from '../infrastructure/meta/timesheet/meta-ts-auth';
import { META_TIMESHEET_CONFIG } from '../infrastructure/meta/timesheet/constants';
import { SeniorStoragePunchProvider } from '../infrastructure/senior/senior-storage-provider';
import { SeniorApiPunchProvider } from '../infrastructure/senior/senior-api-provider';
import { SeniorScraperProvider } from '../infrastructure/senior/senior-scraper';
import { SeniorActiveUserPunchProvider } from '../infrastructure/senior/senior-active-user-provider';
import { ManualPunchProvider } from '../infrastructure/manual/manual-punch-provider';
import { scheduleNotifications } from './schedule-notifications';
import { scheduleTsNotifications } from './schedule-ts-notifications';
import { applyPartialState, applySettings, state, resetNotifScheduled } from './state';
import { calcHorarios } from './calc-schedule';

function buildProviders(): IPunchProvider[] {
  const providers: IPunchProvider[] = [];
  if (ENABLE_MANUAL_PUNCH) providers.push(new ManualPunchProvider());
  if (ENABLE_SENIOR_INTEGRATION) {
    // SeniorActiveUserPunchProvider tem priority 1 (igual ao GP) — primary.
    // Os dois rodam em paralelo e os resultados são mergeados pelo
    // PunchDetector. Esse cobre o gap de mobile-sync (lag do GP pra
    // batimentos vindos do app mobile).
    providers.push(new SeniorActiveUserPunchProvider());
    providers.push(...getCompanyPunchProviders());
    providers.push(new SeniorApiPunchProvider());
    providers.push(new SeniorStoragePunchProvider());
    providers.push(new SeniorScraperProvider());
  }
  return providers;
}

const detector = new PunchDetector(buildProviders());
let _lastHash = '';
let _execCounter = 0;

/**
 * Snapshot enxuto de auth no momento do detect — vai pro log junto com o
 * "iniciando" pra que, quando o detect termina sem dados, dê pra saber
 * qual caminho estava (não) disponível. Sem isso o log só diz "todos
 * providers falharam", sem dizer por quê.
 */
async function snapshotAuthState(now: number): Promise<Record<string, string>> {
  try {
    const data = await chrome.storage.local.get([
      'metaTsToken', 'metaTsTokenTs',
      'gpAssertion', 'gpAssertionTs',
      'seniorToken', 'seniorTokenTs',
    ]);
    const snap: Record<string, string> = {};
    if (typeof data.metaTsToken === 'string') {
      const payload = decodeJwtPayload(data.metaTsToken);
      snap.metaTsToken = payload?.exp ? formatJwtExp(payload.exp, now) : 'opaque';
    } else {
      snap.metaTsToken = 'absent';
    }
    snap.gpAssertion = data.gpAssertionTs ? `age=${formatDuration(now - data.gpAssertionTs)}` : 'absent';
    snap.seniorToken = data.seniorTokenTs ? `age=${formatDuration(now - data.seniorTokenTs)}` : 'absent';
    return snap;
  } catch (_) {
    return { error: 'snapshot failed' };
  }
}

export async function backgroundDetect(trigger: string = 'unknown'): Promise<boolean> {
  const execId = ++_execCounter;
  const startedAt = Date.now();
  const auth = await snapshotAuthState(startedAt);
  const tag = `backgroundDetect[#${execId}]`;
  debugLog(`${tag}: iniciando (trigger=${trigger}, auth=${JSON.stringify(auth)})`);
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

  // BUG 1: aggressive=false em ciclo automático — providers NÃO devem abrir abas
  // sem ação explícita do usuário. Tab-spam no master era causado por
  // GpPunchProvider chamando fetchGpViaTabs(true) e abrindo gestaoponto sozinho.
  const result = await detector.detect(new Date(), false);
  if (!result || result.times.length === 0) {
    debugLog(`${tag}: detector não retornou batimentos (durationMs=${Date.now() - startedAt})`);
    // Sem batimentos detectados ainda é o caminho típico da manhã (Chrome
    // aberto antes da entrada). Agenda os alarmes baseado no estado salvo —
    // garante que `punch_popup_entrada` exista quando state.entrada é null.
    if (ENABLE_NOTIFICATIONS) {
      scheduleNotifications(
        timeToMinutes(state.entrada),
        timeToMinutes(state.almoco),
        timeToMinutes(state.volta),
        timeToMinutes(state._saidaEstimada),
      );
    }
    return false;
  }
  debugLog(`${tag}: detector retornou ${result.times.length} batimentos de ${result.source}`);

  const hash = result.times.join(',');
  if (hash === _lastHash) {
    debugLog(`${tag}: hash igual ao anterior, sem mudanças`);
    return false;
  }
  debugLog(`${tag}: hash mudou (anterior: ${_lastHash.substring(0, 30)}, novo: ${hash.substring(0, 30)})`);
  _lastHash = hash;

  const nowMin = getNowMinutes();
  const past = result.times.filter(t => (timeToMinutes(t) ?? 9999) <= nowMin + 5);
  if (past.length === 0) {
    debugLog(`${tag}: nenhum batimento no passado`);
    return false;
  }
  debugLog(`${tag}: ${past.length} batimentos no passado: ${past.join(', ')}`);

  const currentSlots = [state.entrada, state.almoco, state.volta, state.saida].filter(Boolean).length;
  if (past.length < currentSlots) {
    debugLog(`${tag}: past.length (${past.length}) < currentSlots (${currentSlots}), ignorando`);
    return false;
  }
  debugLog(`${tag}: aplicando ${past.length} batimentos ao estado...`);

  state.entrada = past[0];
  state.almoco = past.length >= 2 ? past[1] : null;
  state.volta = past.length >= 3 ? past[2] : null;
  state.saida = past.length >= 4 ? past[3] : null;

  calcHorarios();
  debugLog(`${tag}: estado calculado - entrada=${state.entrada}, almoco=${state.almoco}, volta=${state.volta}, saida=${state.saida}`);

  await chrome.storage.local.set({ pontoState: state, pontoDate: today });
  resetNotifScheduled();

  if (ENABLE_NOTIFICATIONS) {
    scheduleNotifications(
      timeToMinutes(state.entrada),
      timeToMinutes(state.almoco),
      timeToMinutes(state.volta),
      timeToMinutes(state._saidaEstimada),
    );
  }

  debugLog(`${tag}: state atualizado (durationMs=${Date.now() - startedAt})`, {
    entrada: state.entrada, almoco: state.almoco, volta: state.volta, saida: state.saida,
  });

  if (ENABLE_META_TIMESHEET && (await isTimesheetEnabled())) {
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
// URL de login da plataforma com callback direto pra rota do timesheet.
// Cair em /modules/timesheet/create faz o SPA bootstrapar o módulo do
// timesheet (necessário para que a captura via webRequest pegue o Bearer
// das chamadas reais ao api.meta.com.br). O SSO via Senior é encadeado
// pela própria plataforma.
const META_TS_BOOTSTRAP_URL =
  'https://plataforma.meta.com.br/login?callbackUrl=/modules/timesheet/create';

async function tsAutoConnect(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get('tsAutoConnectTs');
    const lastAttempt = stored.tsAutoConnectTs || 0;
    if (Date.now() - lastAttempt < TS_AUTO_CONNECT_THROTTLE_MS) {
      debugLog('TS auto-connect: throttled (último há <30min)');
      return false;
    }
    chrome.storage.local.set({ tsAutoConnectTs: Date.now() });
    debugLog('TS auto-connect: abrindo aba via SSO Senior (tenant=meta.com.br)...');

    const tab = await chrome.tabs.create({ url: META_TS_BOOTSTRAP_URL, active: false });
    const tabId = tab.id;
    const captured = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        chrome.storage.onChanged.removeListener(onChange);
        resolve(false);
      }, TS_AUTO_CONNECT_TIMEOUT_MS);

      function onChange(changes: Record<string, chrome.storage.StorageChange>, area: string) {
        if (area === 'local' && changes.metaTsToken) {
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

/**
 * Sync silencioso do timesheet — só atualiza o cache se já houver auth válida.
 *
 * BUG 1: NÃO abre abas em background. Se token expirou/morreu:
 *   1. Tenta refresh silencioso via cookie da plataforma Senior
 *   2. Se falhar, desiste em silêncio — cache fica stale e a notificação
 *      de pendentes ainda dispara em cima do último estado conhecido.
 *
 * O re-login via tsAutoConnect() só roda quando o usuário pede explicitamente
 * (botão "Reconectar" no sidepanel — ver BUG 2).
 *
 * Aceita allowInteractive (default false) para permitir que o sidepanel
 * peça uma renovação completa via SSO em ações explícitas.
 *
 * Single-flight: chamadas concorrentes compartilham a mesma execução. Quando
 * o silent refresh seta um token novo, o storage listener dispara nova sync
 * em paralelo à que pediu o refresh — sem o lock isso vira 2 fetches
 * `hours-summary` + 4 `reported-hours` na mesma transição (confirmado em prod).
 *
 * Gate por allowInteractive: chamada em curso passiva NÃO bloqueia uma nova
 * interactive (sidepanel "Reconectar"); a interactive aguarda a passiva
 * terminar e dispara separadamente, podendo abrir aba se necessário.
 */
let inflightSync: Promise<void> | null = null;
let inflightSyncInteractive = false;

export async function backgroundTimesheetSync(allowInteractive = false): Promise<void> {
  if (!ENABLE_META_TIMESHEET) return;
  if (!(await isTimesheetEnabled())) return;

  if (inflightSync) {
    // Em curso cobre nosso requisito (ela é interactive, ou nós aceitamos passiva)
    // → compartilha. Caso contrário (queremos interactive, em curso é passiva),
    // espera a passiva terminar e dispara nossa logo abaixo.
    if (inflightSyncInteractive || !allowInteractive) {
      return inflightSync;
    }
    await inflightSync.catch(() => {});
  }

  inflightSyncInteractive = allowInteractive;
  inflightSync = doBackgroundTimesheetSync(allowInteractive).finally(() => {
    inflightSync = null;
    inflightSyncInteractive = false;
  });
  return inflightSync;
}

async function doBackgroundTimesheetSync(allowInteractive: boolean): Promise<void> {
  try {
    const provider = getTimesheetProvider();
    let isOk = await provider.isAvailable();
    if (!isOk) {
      // Tenta renovar via /api/auth/session sem abrir nova aba
      debugLog('TS sync: sem token, tentando refresh silencioso...');
      const silentToken = await getMetaTsTokenSilently(META_TIMESHEET_CONFIG, metaTsAuth);
      if (silentToken) {
        isOk = await provider.isAvailable();
        if (isOk) debugLog('TS sync: refresh silencioso OK');
        else debugWarn('TS sync: refresh silencioso retornou token mas provider segue indisponível (token inválido?)');
      }
      if (!isOk && allowInteractive) {
        // Só abre aba via SSO se foi explicitamente pedido (sidepanel).
        debugLog('TS sync: interactive=true, tentando auto-connect via SSO...');
        await chrome.storage.local.remove(['tsAutoConnectTs']);
        const connected = await tsAutoConnect();
        if (connected) isOk = await provider.isAvailable();
      }
      if (!isOk) {
        debugWarn('TS sync: sem auth — cache stale, mas notificação de pendentes segue lendo o último estado');
        return;
      }
    }
    const period = getCurrentTimesheetPeriod();
    const summary = await provider.getSummary(period);
    if (summary) {
      chrome.storage.local.set({ timesheetSummaryCache: summary, timesheetSyncTs: Date.now() });
      debugLog(`TS sync: ${summary.entries.length} entries, ${summary.pendingHours}h pendentes`);
    }
  } catch (e) {
    debugWarn('TS sync erro:', (e as Error).message);
  }
}

/* v8 ignore next 4 -- helper apenas para testes */
export function _resetTsSyncInflight(): void {
  inflightSync = null;
  inflightSyncInteractive = false;
}

const TS_NOTIF_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h após dismiss
const TS_NOTIF_DEBOUNCE_MS = 30_000; // 30s entre chamadas
let _tsNotifLastCall = 0;

export function resetTsNotifDebounce(): void {
  _tsNotifLastCall = 0;
}

export async function notifyPendingTimesheet(): Promise<void> {
  // weekdaysOnly: não notifica em sábado/domingo. Lê do storage (não usa
  // `settings` em memória) porque o SW MV3 hiberna e essa função pode rodar
  // antes do próximo backgroundDetect re-hidratar `settings`.
  if (await isReminderBlockedToday()) {
    debugLog('Popup timesheet: fim de semana, ignorando (weekdaysOnly=true)');
    return;
  }

  // Debounce: ignora chamadas em sequência rápida
  const now = Date.now();
  if (now - _tsNotifLastCall < TS_NOTIF_DEBOUNCE_MS) {
    debugLog('Popup timesheet: debounce, ignorando');
    return;
  }
  _tsNotifLastCall = now;

  try {
    // BUG 1: notificação NÃO depende de auth válida — usa só o cache.
    // Se o token expirou, o cache fica stale mas o aviso continua avisando
    // sobre o último estado conhecido. O sync acontece em outros gatilhos
    // (webRequest captura novo token, sidepanel onMount, edição manual).
    const stored = await chrome.storage.local.get([
      'timesheetSummaryCache', 'tsNotifWindowId', 'pontoState', 'tsNotifDismissedTs', 'userProfile',
    ]);
    // Gate via onboarding: se user disse que não preenche timesheet, ignora.
    // Lido nesta mesma chamada batch pra não acrescentar I/O extra.
    const profile = stored.userProfile as { hasTimesheet?: boolean | null } | undefined;
    if (profile?.hasTimesheet === false) return;
    const ps = stored.pontoState as { entrada?: string | null; saida?: string | null } | null;

    // Só exibe dentro da janela de trabalho: entrada registrada e saída ainda não batida
    if (!ps?.entrada || ps?.saida) return;

    // Cooldown: respeita dismiss do usuário por 2h
    const dismissedTs = (stored.tsNotifDismissedTs as number) || 0;
    if (now - dismissedTs < TS_NOTIF_COOLDOWN_MS) {
      debugLog('Popup timesheet: cooldown ativo (dismiss recente)');
      return;
    }

    const summary = stored.timesheetSummaryCache as TimesheetSummary | undefined;
    if (!summary) return;
    const pendingNoObs = summary.entries.filter(e => e.status === 'PENDING' && !e.observation);
    if (pendingNoObs.length === 0) return;

    // Se já tem popup aberta, só foca nela
    if (stored.tsNotifWindowId) {
      try {
        const existing = await chrome.windows.get(stored.tsNotifWindowId);
        if (existing) {
          await chrome.windows.update(stored.tsNotifWindowId, { focused: true });
          debugLog('Popup timesheet: já aberta, focando');
          return;
        }
      } catch (_) {
        // janela não existe mais, segue para criar nova
      }
    }

    const url = `ts-notification.html?count=${pendingNoObs.length}`;
    const width = 420;
    const height = 300;

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
