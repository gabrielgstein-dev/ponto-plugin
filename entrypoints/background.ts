import { ENABLE_SENIOR_INTEGRATION, ENABLE_META_TIMESHEET } from '../lib/domain/build-flags';
import { isTimesheetEnabled } from '../lib/domain/timesheet-gate';
import { debugLog } from '../lib/domain/debug';
import { installErrorHandlers } from '../lib/domain/install-error-handlers';
import { handleDailyReset, handleReminderAlarm, handleNotifAlarm, handlePunchPopupAlarm } from '../lib/application/handle-alarm';
import { recheckReminder, resolveReminder, dismissSlotForToday, markSlotPunched, snoozeReminder, DISMISSED_SLOTS_KEY } from '../lib/application/punch-reminder-manager';
import type { PunchReminderSlot } from '../lib/domain/types';
import { backgroundDetect, resetBackgroundHash, notifyPendingTimesheet, backgroundTimesheetSync, resetTsNotifDebounce } from '../lib/application/background-detect';
import { handleTsAlarm } from '../lib/application/schedule-ts-notifications';
import { addPendingPunch, loadPendingPunches } from '../lib/application/detect-punches';
import { resetGpPunchCache, getTimesheetProvider } from '#company/providers';
import { resetSeniorApiCache } from '../lib/infrastructure/senior/senior-api-provider';
import { resetSeniorStorageCache } from '../lib/infrastructure/senior/senior-storage-provider';
import { resetSeniorActiveUserCache } from '../lib/infrastructure/senior/senior-active-user-provider';
import { getGpAssertion } from '../lib/infrastructure/meta/gestaoponto/gp-auth';
import { COMPANY_PUNCH_URL } from '#company/providers';
import { directFetchMetaTs } from '../lib/infrastructure/meta/timesheet/meta-ts-direct-fetch';
import { directFetchSenior } from '../lib/infrastructure/senior/senior-direct-fetch';
import { directFetchGp } from '../lib/infrastructure/meta/gestaoponto/gp-direct-fetch';
import { SeniorCookieAuth } from '../lib/infrastructure/senior/senior-cookie-auth';
import { SENIOR_TOKEN_MAX_AGE_MS } from '../lib/infrastructure/senior/constants';
import { META_TIMESHEET_CONFIG } from '../lib/infrastructure/meta/timesheet/constants';
import { getCurrentTimesheetPeriod } from '../lib/domain/timesheet-period';
import { isValidJWT, decodeJwtPayload, formatJwtExp } from '../lib/domain/jwt-utils';
import { dumpSeniorTabStorage } from '../lib/infrastructure/senior/senior-storage-dump';
import { initializeStorageIfNeeded } from '../lib/application/install-init';
import {
  openMetaXPopup,
  markMetaXResponded,
  snoozeMetaXReminder,
  handleMetaXSnoozeAlarm,
  handleMetaXDailyNotify,
  scheduleMetaXAfternoonAlarm,
  META_X_SNOOZE_ALARM,
  META_X_NOTIFY_ALARM,
} from '../lib/application/meta-x-reminder-manager';
import { refreshMetaXBadge } from '../lib/application/meta-x-badge';
import { META_X_URL, hasRespondedThisWeek } from '../lib/domain/meta-x-status';
import { appendNetEntry, getNetEntries, clearNetEntries, type MetaNetEntry } from '../lib/domain/meta-net-log';
import type { MetaXState } from '../lib/domain/types';

export default defineBackground(() => {
  installErrorHandlers();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });


  // onInstalled dispara em install, update e chrome_update. A lógica de
  // inicialização defensiva está em lib/application/install-init.ts —
  // single source of truth com os tests pra evitar divergência.
  chrome.runtime.onInstalled.addListener(() => {
    initializeStorageIfNeeded().catch(() => {});
  });

  if (ENABLE_SENIOR_INTEGRATION) {
    chrome.webRequest.onSendHeaders.addListener(
      (details) => {
        const authHeader = details.requestHeaders?.find(
          h => h.name.toLowerCase() === 'authorization'
        );
        if (authHeader?.value && /^[Bb]earer\s/.test(authHeader.value)) {
          const token = authHeader.value.split(/\s+/)[1];
          if (token && token.length > 20) {
            chrome.storage.local.set({ seniorToken: token, seniorTokenTs: Date.now() });
            // DIAG: registra de onde veio cada token capturado. Hipótese investigativa:
            // o webRequest pode estar pegando Bearer de OUTROS apps dentro do
            // Senior X (Favoritos, frames de outros módulos), e cada app tem
            // escopo de token diferente — explicaria por que tokens "frescos"
            // levam 401 no GP/pontomobile.
            // Extrai scope do path da bridge: `.../bridge/1.0/rest/<dom>/<svc>/...`
            // Senior X usa tokens com escopo diferente por app — saber qual
            // escopo foi capturado ajuda a entender por que `auth/g7` aceita
            // ou rejeita um token específico.
            const scopeMatch = details.url.match(/\/bridge\/[^/]+\/rest\/([^/]+(?:\/[^/?]+)?)/);
            const scope = scopeMatch?.[1] ?? '(non-bridge)';
            debugLog('[diag] Senior Bearer captured', JSON.stringify({
              scope,
              url: details.url,
              tokenPrefix: token.substring(0, 8),
              tokenLength: token.length,
              method: details.method,
              tabId: details.tabId,
            }));
          }
        }
      },
      { urls: ['https://platform.senior.com.br/*', 'https://*.senior.com.br/*'] },
      ['requestHeaders', 'extraHeaders']
    );

    // Captura o `refreshToken` do body quando a SPA Senior chama o endpoint
    // de refresh. Sem essa captura o `refreshSeniorTokenSilently` fica inerte
    // — o refresh_token vive em memória da SPA e não é acessível via cookies
    // nem via storage da página (testado: localStorage/sessionStorage/IndexedDB
    // não têm o token, dump em 2026-05-07).
    //
    // A primeira captura depende do SPA Senior fazer um refresh natural após
    // a instalação (acontece a cada ~50min, ou quando access_token expira).
    // Daí em diante o silent refresh nosso assume e roda eternamente.
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (details.method !== 'POST') return;
        const raw = details.requestBody?.raw?.[0]?.bytes;
        if (!raw) return;
        try {
          const body = new TextDecoder().decode(raw);
          const json = JSON.parse(body) as { refreshToken?: unknown };
          const rt = json.refreshToken;
          if (typeof rt === 'string' && rt.length > 10) {
            chrome.storage.local.set({ seniorRefreshToken: rt });
            debugLog('[diag] Senior refresh_token captured via SPA refresh call', JSON.stringify({
              tokenPrefix: rt.substring(0, 8),
              length: rt.length,
              tabId: details.tabId,
            }));
          }
        } catch (_) { /* body não é JSON ou não tem refreshToken */ }
      },
      { urls: ['https://platform.senior.com.br/t/*/platform/authentication/actions/refreshToken'] },
      ['requestBody']
    );
  }

  if (ENABLE_META_TIMESHEET) {
    chrome.webRequest.onSendHeaders.addListener(
      (details) => {
        const authHeader = details.requestHeaders?.find(
          h => h.name.toLowerCase() === 'authorization'
        );
        if (authHeader?.value && /^[Bb]earer\s/.test(authHeader.value)) {
          const token = authHeader.value.split(/\s+/)[1];
          if (!token || token.length <= 20) return;
          // Valida `exp` antes de aceitar. Tokens Meta TS são JWT com TTL
          // ~5min; a SPA às vezes dispara request com token cacheado
          // expirado antes de renovar via /api/auth/session. Sem essa
          // validação, persistíamos token vencido no storage → próxima
          // sync via abria aba SSO inutilmente (visto em prod com exp
          // 76min no passado, 2026-05-07).
          if (!isValidJWT(token, 0)) {
            debugLog('[diag] meta TS Bearer rejected (expired or non-JWT)', JSON.stringify({
              tokenPrefix: token.substring(0, 8),
              tokenLength: token.length,
            }));
            return;
          }
          chrome.storage.local.set({ metaTsToken: token, metaTsTokenTs: Date.now() });
          // Happy-path: registra a captura pra que o log mostre "último estado bom"
          // mesmo em casos onde tudo passa a falhar depois. O dedupe do log-store
          // colapsa capturas idênticas seguidas (mesma string vira repeat++).
          const exp = decodeJwtPayload(token)?.exp;
          debugLog(`metaTsToken capturado via webRequest${exp ? ` (${formatJwtExp(exp)})` : ''}`);
        }
      },
      { urls: ['https://api.meta.com.br/*'] },
      ['requestHeaders', 'extraHeaders']
    );
  }

  // Meta X: detecta conclusão do survey TeamCulture via URL da página /finish.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url && changeInfo.url.includes('/engagement/survey/finish')) {
      debugLog('Meta X: página /finish detectada via tabs.onUpdated');
      chrome.storage.local.get(['metaXState', 'pontoSettings'], (data) => {
        if (data.pontoSettings?.metaXReminder === false) return;
        const now = new Date();
        if (hasRespondedThisWeek(data.metaXState as MetaXState | null, now)) return;
        markMetaXResponded(now).then(() => resumeSaidaAfterMetaX()).catch(() => {});
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'META_NETLOG_APPEND') {
      const entry = message.entry as MetaNetEntry | undefined;
      if (!entry || typeof entry !== 'object') { sendResponse({ ok: false }); return true; }
      appendNetEntry(entry).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'META_NETLOG_GET') {
      getNetEntries().then(entries => sendResponse({ ok: true, entries })).catch(() => sendResponse({ ok: false, entries: [] }));
      return true;
    }
    if (message.type === 'META_NETLOG_CLEAR') {
      clearNetEntries().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'OPEN_SIDE_PANEL') {
      const windowId = sender.tab?.windowId;
      if (windowId) {
        chrome.sidePanel.open({ windowId }).then(() => sendResponse({ ok: true }));
      } else {
        chrome.windows.getAll({ windowTypes: ['normal'] }, (wins) => {
          const target = wins.find(w => w.focused) || wins[0];
          if (target?.id) chrome.sidePanel.open({ windowId: target.id }).then(() => sendResponse({ ok: true }));
        });
      }
      return true;
    }
    if (message.type === 'CLOSE_TS_NOTIFICATION') {
      chrome.storage.local.get('tsNotifWindowId', (data) => {
        const dismiss = () => {
          chrome.storage.local.set({ tsNotifDismissedTs: Date.now() });
          chrome.storage.local.remove('tsNotifWindowId');
        };
        if (data.tsNotifWindowId) {
          chrome.windows.remove(data.tsNotifWindowId, () => {
            dismiss();
            sendResponse({ ok: true });
          });
        } else if (sender.tab?.windowId) {
          chrome.windows.remove(sender.tab.windowId, () => {
            dismiss();
            sendResponse({ ok: true });
          });
        } else {
          sendResponse({ ok: false });
        }
      });
      return true;
    }
    if (message.type === 'REQUEST_TS_SYNC') {
      // Vem do sidepanel quando o usuário abriu o painel e o token está
      // expirado — único momento em que abrir aba via SSO faz sentido (BUG 1+2).
      backgroundTimesheetSync(true).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'TS_GET_SUMMARY') {
      // Centralizado no service worker: a aba do meta-ts é criada/reutilizada
      // só aqui (mutex de módulo cobre). Sidepanel não chama provider direto
      // pra evitar 2 contextos criando abas em paralelo.
      const period = message.period as string | undefined;
      if (!period) { sendResponse({ ok: false, error: 'period required' }); return true; }
      (async () => {
        try {
          if (!(await isTimesheetEnabled())) {
            sendResponse({ ok: false, error: 'timesheet disabled' });
            return;
          }
          const provider = getTimesheetProvider();
          const summary = await provider.getSummary(period);
          if (summary) {
            await chrome.storage.local.set({ timesheetSummaryCache: summary, timesheetSyncTs: Date.now() });
          }
          sendResponse({ ok: true, summary });
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error).message });
        }
      })();
      return true;
    }
    if (message.type === 'TS_UPDATE_ENTRY') {
      const { entryId, entry, body } = message as {
        entryId: string;
        entry: import('../lib/domain/types').TimesheetEntry;
        body: { observation: string; hourQuantity: number };
      };
      (async () => {
        try {
          if (!(await isTimesheetEnabled())) {
            sendResponse({ ok: false, error: 'timesheet disabled' });
            return;
          }
          const provider = getTimesheetProvider();
          const ok = await provider.updateEntry(entryId, entry, body);
          sendResponse({ ok });
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error).message });
        }
      })();
      return true;
    }
    if (message.type === 'TEST_TS_NOTIFICATION') {
      // Bypass do debounce: o gatilho de teste deve sempre rodar imediatamente
      resetTsNotifDebounce();
      notifyPendingTimesheet().catch(() => {});
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'OPEN_PUNCH_PAGE') {
      openPunchPage().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'MARK_SLOT_PUNCHED') {
      // Modo escalado: usuário confirma que bateu no celular. Marca o slot
      // manualmente com o expectedTime — bgDetect futuro pode sobrescrever
      // com o horário real quando o sync chegar.
      const slot = message.slot as PunchReminderSlot;
      const time = (message.time as string) || '';
      if (!slot || !time) { sendResponse({ ok: false, error: 'slot e time obrigatórios' }); return true; }
      markSlotPunched(slot, time).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'SNOOZE_REMINDER') {
      // Snooze: usuário pediu pra ser lembrado daqui X minutos. Fecha o popup
      // atual e reagenda via mesmo caminho do alarme normal (punch_popup_<slot>).
      const slot = message.slot as PunchReminderSlot;
      const time = (message.time as string) || '';
      const minutes = Number(message.minutes);
      if (!slot || !Number.isFinite(minutes) || minutes <= 0) {
        sendResponse({ ok: false, error: 'slot e minutes obrigatórios' });
        return true;
      }
      snoozeReminder(slot, time, minutes).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'DISMISS_SLOT_REMINDERS') {
      // Modo escalado: usuário pediu pra parar de lembrar pro slot hoje.
      // Persistido até dailyReset à meia-noite.
      const slot = message.slot as PunchReminderSlot;
      if (!slot) { sendResponse({ ok: false, error: 'slot obrigatório' }); return true; }
      dismissSlotForToday(slot).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'FORCE_REDETECT') {
      // Override manual quando UI estiver presa ou cache stale: reseta
      // todos caches (gp/api/storage + lastHash) e força detecção agressiva.
      // Sidepanel chama via botão "↻ Sincronizar" — substitui o anti-padrão
      // "abrir aba do Senior pra destravar".
      resetAllCaches();
      backgroundDetect('force-redetect')
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'TEST_META_TS_DIRECT_FETCH') {
      // POC: fetch direto pra api.meta.com.br do service worker.
      // host_permissions cobre o host → fetch sem CORS. Se 200 → abas eliminadas.
      (async () => {
        const data = await chrome.storage.local.get(['metaTsToken', 'metaTsTokenTs']);
        const token = data.metaTsToken as string | undefined;
        const tokenTs = data.metaTsTokenTs as number | undefined;
        if (!token) {
          sendResponse({ ok: false, error: 'metaTsToken ausente — abra https://plataforma.meta.com.br/modules/timesheet/create 1x pra capturar' });
          return;
        }
        const period = message.period as string | undefined ?? getCurrentTimesheetPeriod(0);
        const url = `${META_TIMESHEET_CONFIG.apiUrl}${META_TIMESHEET_CONFIG.timesheetsBase}/hours-summary?period=${period}`;
        const tokenAgeMs = tokenTs ? Date.now() - tokenTs : null;
        debugLog('[POC] TEST_META_TS_DIRECT_FETCH iniciando', JSON.stringify({
          url, tokenPrefix: token.substring(0, 8), period, tokenAgeMs,
        }));
        const result = await directFetchMetaTs(url, token, tokenAgeMs);
        debugLog('[POC] TEST_META_TS_DIRECT_FETCH resultado', JSON.stringify({
          ok: result.ok,
          status: result.status,
          bodyLength: result.bodyLength,
          contentType: result.contentType,
          tokenInfo: result.tokenInfo,
          responseHeaders: result.responseHeaders,
          bodyPreview: result.bodyPreview,
          errorMessage: result.errorMessage,
        }));
        sendResponse({ ok: true, result });
      })();
      return true;
    }
    if (message.type === 'TEST_SENIOR_STORAGE_DUMP') {
      // POC: dumpa local/sessionStorage da aba Senior pra descobrir onde está
      // o refresh_token. Read-only.
      (async () => {
        const result = await dumpSeniorTabStorage();
        sendResponse({ ok: true, result });
      })();
      return true;
    }
    if (message.type === 'SPIKE_SENIOR_DIRECT_FETCH') {
      // Spike: testa fetch direto contra pontomobile_bff sem aba aberta.
      // Resolve token: cookie OAuth → storage (seniorToken).
      (async () => {
        try {
          let token: string | null = null;
          let tokenAgeMs: number | null = null;
          const cookieToken = await new SeniorCookieAuth().getAccessToken().catch(() => null);
          if (cookieToken) {
            token = cookieToken;
            tokenAgeMs = 0;
          } else {
            const stored = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
            if (stored.seniorToken && stored.seniorTokenTs) {
              const age = Date.now() - stored.seniorTokenTs;
              if (age < SENIOR_TOKEN_MAX_AGE_MS) {
                token = stored.seniorToken;
                tokenAgeMs = age;
              }
            }
          }
          if (!token) {
            sendResponse({ ok: false, error: 'sem token Senior — abra a aba do Senior 1x pra capturar' });
            return;
          }
          const result = await directFetchSenior(token, tokenAgeMs);
          sendResponse({ ok: true, result });
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error).message });
        }
      })();
      return true;
    }
    if (message.type === 'SPIKE_GP_DIRECT_FETCH') {
      // Spike: simétrico ao do Senior. GP já roda direct fetch em produção;
      // aqui retornamos a resposta crua pra comparar com o Senior.
      (async () => {
        try {
          const result = await directFetchGp();
          sendResponse({ ok: true, result });
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error).message });
        }
      })();
      return true;
    }
    if (message.type === 'TEST_PUNCH_REMINDER') {
      const slot = message.slot || 'almoco';
      const time = message.time || '12:00';
      const url = `${chrome.runtime.getURL('punch-reminder.html')}?slot=${slot}&time=${encodeURIComponent(time)}`;
      chrome.windows.create({ url, type: 'popup', width: 420, height: 300, focused: true })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'META_X_SNOOZE') {
      (async () => {
        await snoozeMetaXReminder();
        // Não bloqueia o ponto de saída — dispara o punch reminder normal
        // do slot 'saida' se houver gate pendente.
        await resumeSaidaAfterMetaX();
        sendResponse({ ok: true });
      })();
      return true;
    }
    if (message.type === 'OPEN_META_X_SURVEY') {
      chrome.tabs.create({ url: META_X_URL, active: true }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'TEST_META_X_POPUP') {
      // Bypass dos guards de elegibilidade (dia/respondida/toggle) pra dev poder
      // testar fora de terça/quarta. Abre direto via chrome.windows.
      const ctx = (message.ctx as 'morning' | 'exit_gate' | 'snooze' | 'afternoon_notif') || 'morning';
      const url = `${chrome.runtime.getURL('meta-x-reminder.html')}?ctx=${ctx}`;
      chrome.windows.create({ url, type: 'popup', width: 460, height: 380, focused: true })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message.type === 'SHOW_NOTIFICATION') {
      chrome.notifications.create(message.id || '', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: message.title || 'Senior Ponto',
        message: message.message || '',
        priority: 2,
      }, (id: string) => {
        setTimeout(() => chrome.notifications.clear(id), 8000);
      });
      sendResponse({ ok: true });
    }
    return true;
  });

  chrome.notifications.onClicked.addListener((notifId) => {
    if (notifId === 'timesheet-pending') {
      chrome.notifications.clear(notifId);
      chrome.storage.local.set({ sidePanelTab: 'timesheet' });
      chrome.windows.getCurrent((win) => {
        if (win?.id) chrome.sidePanel.open({ windowId: win.id });
      });
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailyReset') { handleDailyReset(); return; }
    if (alarm.name === 'bgDetect') {
      // BUG 1: sequencial, não paralelo. backgroundDetect e backgroundTimesheetSync
      // não devem disputar a abertura de abas — ambos rodam em modo silencioso
      // (sem aggressive=true / sem tsAutoConnect automático).
      (async () => {
        try { await backgroundDetect('alarm:bgDetect'); } catch (_) { /* ignore */ }
        try { await backgroundTimesheetSync(); } catch (_) { /* ignore */ }
      })();
      return;
    }
    if (alarm.name === META_X_SNOOZE_ALARM) { handleMetaXSnoozeAlarm().catch(() => {}); return; }
    if (alarm.name === META_X_NOTIFY_ALARM) { handleMetaXDailyNotify().catch(() => {}); return; }
    if (alarm.name === 'tsNotifCheck') {
      // BUG 1: alarm dedicado pra checar timesheet pendente — lê só o cache,
      // independente de sync/token. Se o usuário tem entries pendentes,
      // ele vai ser avisado dentro do horário de trabalho mesmo se o token expirou.
      notifyPendingTimesheet().catch(() => {});
      return;
    }
    if (alarm.name === 'punch_recheck') { recheckReminder().catch(() => {}); return; }
    if (alarm.name.startsWith('punch_popup_')) {
      maybeInterceptSaidaForMetaX(alarm.name, alarm.scheduledTime).catch(() => {});
      return;
    }
    if (alarm.name.startsWith('reminder_')) { handleReminderAlarm(alarm.name, alarm.scheduledTime); return; }
    if (alarm.name.startsWith('notif_')) { handleNotifAlarm(alarm.name, alarm.scheduledTime); return; }
    if (alarm.name.startsWith('ts_')) { handleTsAlarm(alarm.name); }
  });

  chrome.windows.onRemoved.addListener((windowId) => {
    chrome.storage.local.get(
      ['punchPopupWindowId', 'punchPopupSlot', 'punchPopupEscalated', 'tsNotifWindowId', 'metaXPopupWindowId', 'metaXState', 'pontoSettings'],
      (data) => {
        if (data.punchPopupWindowId === windowId) {
          if (data.punchPopupEscalated && data.punchPopupSlot) {
            dismissSlotForToday(data.punchPopupSlot as PunchReminderSlot).catch(() => {});
          } else {
            chrome.storage.local.remove('punchPopupWindowId');
          }
        }
        if (data.tsNotifWindowId === windowId) {
          chrome.storage.local.set({ tsNotifDismissedTs: Date.now() });
          chrome.storage.local.remove('tsNotifWindowId');
        }
        if (data.metaXPopupWindowId === windowId) {
          chrome.storage.local.remove(['metaXPopupWindowId', 'metaXPopupContext']);
          const now = new Date();
          const isWed = now.getDay() === 3;
          const past17 = now.getHours() >= 17;
          const enabled = data.pontoSettings?.metaXReminder !== false;
          const pending = !hasRespondedThisWeek(data.metaXState as MetaXState | null, now);
          if (isWed && past17 && enabled && pending) {
            debugLog('Meta X: popup fechado após 17h sem resposta — reabrindo');
            setTimeout(() => openMetaXPopup('afternoon_notif').catch(() => {}), 2000);
          }
        }
    });
  });

  chrome.alarms.get('dailyReset', (existing) => {
    if (!existing) {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setDate(now.getDate() + 1);
      midnight.setHours(0, 0, 0, 0);
      chrome.alarms.create('dailyReset', { when: midnight.getTime(), periodInMinutes: 1440 });
    }
  });

  chrome.alarms.create('bgDetect', { periodInMinutes: 10 });

  // BUG 1: alarm separado pra checar pendentes do cache (sem depender de sync).
  // 30 min é suficiente — o popup tem cooldown próprio de 2h após dismiss.
  chrome.alarms.create('tsNotifCheck', { periodInMinutes: 30 });

  async function openPunchPage() {
    const tabs = await chrome.tabs.query({ url: 'https://platform.senior.com.br/*' });
    const existing = tabs.find(t => t.url?.includes('clockingEvent') || t.url?.includes('clocking-event'));
    if (existing?.id != null) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return;
    }
    await chrome.tabs.create({ url: COMPANY_PUNCH_URL, active: true });
  }

  const META_X_GATE_SAIDA_KEY = 'metaXGateSaidaExpectedTime';

  async function maybeInterceptSaidaForMetaX(alarmName: string, scheduledTime: number): Promise<void> {
    if (alarmName !== 'punch_popup_saida') {
      await handlePunchPopupAlarm(alarmName, scheduledTime);
      return;
    }
    const now = new Date();
    const data = await chrome.storage.local.get(['pontoSettings', 'metaXState', `alarm_time_${alarmName}`]);
    const isWed = now.getDay() === 3;
    const enabled = data.pontoSettings?.metaXReminder !== false;
    const pending = !hasRespondedThisWeek(data.metaXState as MetaXState | null, now);
    if (!isWed || !enabled || !pending) {
      await handlePunchPopupAlarm(alarmName, scheduledTime);
      return;
    }
    // Gate: salva expectedTime, abre meta-x popup ('exit_gate'). O punch
    // popup de saída só dispara depois que o user responder/snoozar.
    const expectedTime = (data[`alarm_time_${alarmName}`] as string) || '';
    await chrome.storage.local.set({ [META_X_GATE_SAIDA_KEY]: expectedTime });
    await openMetaXPopup('exit_gate');
  }

  async function resumeSaidaAfterMetaX(): Promise<void> {
    const data = await chrome.storage.local.get(META_X_GATE_SAIDA_KEY);
    const expectedTime = data[META_X_GATE_SAIDA_KEY] as string | undefined;
    if (!expectedTime) return;
    await chrome.storage.local.remove(META_X_GATE_SAIDA_KEY);
    await chrome.storage.local.set({ alarm_time_punch_popup_saida: expectedTime });
    chrome.alarms.create('punch_popup_saida', { when: Date.now() + 1000 });
  }

  async function maybeTriggerMetaXOnEntrada(): Promise<void> {
    const now = new Date();
    const day = now.getDay();
    if (day !== 2 && day !== 3) return;
    const data = await chrome.storage.local.get(['pontoSettings', 'metaXState']);
    if (data.pontoSettings?.metaXReminder === false) return;
    if (hasRespondedThisWeek(data.metaXState as MetaXState | null, now)) return;
    if (day === 2) {
      await openMetaXPopup('tuesday_preview');
      return;
    }
    await openMetaXPopup('morning');
    await refreshMetaXBadge(now);
    await scheduleMetaXAfternoonAlarm(now);
  }

  function resetAllCaches() {
    resetGpPunchCache();
    resetSeniorApiCache();
    resetSeniorStorageCache();
    resetSeniorActiveUserCache();
    resetBackgroundHash();
  }

  function triggerReDetection(time: string) {
    addPendingPunch(time);
    resetAllCaches();
    backgroundDetect('punch-success').catch(() => {});
    [5000, 12000, 25000].forEach(delay => {
      setTimeout(() => {
        resetAllCaches();
        backgroundDetect(`punch-success:retry${delay}ms`).catch(() => {});
      }, delay);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.pontoState) {
      const newState = changes.pontoState.newValue;
      const oldState = changes.pontoState.oldValue;
      chrome.storage.local.get('punchPopupSlot', (data) => {
        const slot = data.punchPopupSlot as PunchReminderSlot | null;
        if (!slot) return;
        if (newState?.[slot] || newState?.saida) {
          resolveReminder(slot).catch(() => {});
        }
      });
      // Camada 3: 1ª batida do dia na quarta dispara popup Meta X (uma vez)
      if (!oldState?.entrada && newState?.entrada) {
        maybeTriggerMetaXOnEntrada().catch(() => {});
      }
    }
    if (changes.punchSuccessTs) {
      const punchTime = changes.punchSuccessTime?.newValue as string | undefined;
      const now = new Date();
      const fallbackTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const time = punchTime || fallbackTime;
      debugLog(`Background: punch registrado (${time}), pending + re-detectando...`);
      triggerReDetection(time);
    }
    if (changes.seniorToken && changes.seniorToken.newValue) {
      debugLog('Background: seniorToken capturado, renovando GP assertion...');
      getGpAssertion(true).then(auth => {
        if (auth) {
          debugLog('Background: GP assertion renovado (colab:', auth.colaboradorId, 'calc:', auth.codigoCalculo, ')');
          resetAllCaches();
          backgroundDetect('senior-token-captured').catch(() => {});
        } else {
          debugLog('Background: falha ao renovar GP assertion');
        }
      }).catch(() => {});
    }
    if (changes.metaTsToken) {
      // Só dispara em transição ausente↔presente. Renovações rotineiras
      // (presente→presente diferente) NÃO precisam de re-sync — caso contrário
      // cada `fetchHoursSummary` que captura novo Bearer dispara nova sync,
      // que dispara nova captura, em loop. Confirmado em prod 2026-05-07.
      const hadToken = !!changes.metaTsToken.oldValue;
      const hasToken = !!changes.metaTsToken.newValue;
      if (!hadToken && hasToken) {
        debugLog('Background: metaTsToken apareceu (login/auto-connect), sincronizando...');
        backgroundTimesheetSync()
          .then(() => notifyPendingTimesheet())
          .catch(() => {});
      }
    }
    if (changes.tsMutationTs) {
      debugLog('Background: edição manual de timesheet detectada, re-sincronizando...');
      backgroundTimesheetSync().catch(() => {});
    }
    if (changes.seniorPunchApi && !changes.punchSuccessTs) {
      const info = changes.seniorPunchApi.newValue;
      const url = (info?.url || '').toLowerCase();
      if (url.includes('import') || url.includes('register') || url.includes('registrar') || url.includes('marcacao') || url.includes('batimento')) {
        const now = new Date();
        const fallbackTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        debugLog(`Background: punch API detectada via spy (${fallbackTime}), re-detectando...`);
        triggerReDetection(fallbackTime);
      }
    }
  });

  // BUG 1: NÃO chamar backgroundTimesheetSync no startup — o service worker
  // do MV3 reinicia com frequência e cada wake-up disparava sync, que podia
  // abrir aba pra renovar token. Agora o sync só acontece pelo alarm bgDetect
  // (a cada 10min, em modo silencioso) ou por trigger explícito.
  loadPendingPunches().then(() => {
    backgroundDetect('startup').catch(() => {});
  }).catch(() => {});

  refreshMetaXBadge().catch(() => {});
  scheduleMetaXAfternoonAlarm().catch(() => {});
});
