import { ENABLE_SENIOR_INTEGRATION, ENABLE_META_TIMESHEET } from '../lib/domain/build-flags';
import { debugLog } from '../lib/domain/debug';
import { installErrorHandlers } from '../lib/domain/install-error-handlers';
import { handleDailyReset, handleReminderAlarm, handleNotifAlarm, handlePunchPopupAlarm } from '../lib/application/handle-alarm';
import { recheckReminder, resolveReminder } from '../lib/application/punch-reminder-manager';
import type { PunchReminderSlot } from '../lib/domain/types';
import { backgroundDetect, resetBackgroundHash, notifyPendingTimesheet, backgroundTimesheetSync, resetTsNotifDebounce } from '../lib/application/background-detect';
import { handleTsAlarm } from '../lib/application/schedule-ts-notifications';
import { addPendingPunch, loadPendingPunches } from '../lib/application/detect-punches';
import { resetGpPunchCache } from '#company/providers';
import { resetSeniorApiCache } from '../lib/infrastructure/senior/senior-api-provider';
import { resetSeniorStorageCache } from '../lib/infrastructure/senior/senior-storage-provider';
import { getGpAssertion } from '../lib/infrastructure/meta/gestaoponto/gp-auth';
import { COMPANY_PUNCH_URL } from '#company/providers';

export default defineBackground(() => {
  installErrorHandlers();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['pontoState'], (result) => {
      if (!result.pontoState) {
        chrome.storage.local.set({ pontoState: null, pontoSettings: null, pontoDate: new Date().toDateString() });
      }
    });
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
          }
        }
      },
      { urls: ['https://platform.senior.com.br/*', 'https://*.senior.com.br/*'] },
      ['requestHeaders', 'extraHeaders']
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
          if (token && token.length > 20) {
            chrome.storage.local.set({ metaTsToken: token, metaTsTokenTs: Date.now() });
          }
        }
      },
      { urls: ['https://api.meta.com.br/*'] },
      ['requestHeaders', 'extraHeaders']
    );
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    if (message.type === 'TEST_PUNCH_REMINDER') {
      const slot = message.slot || 'almoco';
      const time = message.time || '12:00';
      const url = `${chrome.runtime.getURL('punch-reminder.html')}?slot=${slot}&time=${encodeURIComponent(time)}`;
      chrome.windows.create({ url, type: 'popup', width: 420, height: 220, focused: true })
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
        try { await backgroundDetect(); } catch (_) { /* ignore */ }
        try { await backgroundTimesheetSync(); } catch (_) { /* ignore */ }
      })();
      return;
    }
    if (alarm.name === 'tsNotifCheck') {
      // BUG 1: alarm dedicado pra checar timesheet pendente — lê só o cache,
      // independente de sync/token. Se o usuário tem entries pendentes,
      // ele vai ser avisado dentro do horário de trabalho mesmo se o token expirou.
      notifyPendingTimesheet().catch(() => {});
      return;
    }
    if (alarm.name === 'punch_recheck') { recheckReminder().catch(() => {}); return; }
    if (alarm.name.startsWith('punch_popup_')) { handlePunchPopupAlarm(alarm.name).catch(() => {}); return; }
    if (alarm.name.startsWith('reminder_')) { handleReminderAlarm(alarm.name); return; }
    if (alarm.name.startsWith('notif_')) { handleNotifAlarm(alarm.name); return; }
    if (alarm.name.startsWith('ts_')) { handleTsAlarm(alarm.name); }
  });

  chrome.windows.onRemoved.addListener((windowId) => {
    chrome.storage.local.get(['punchPopupWindowId', 'tsNotifWindowId'], (data) => {
      if (data.punchPopupWindowId === windowId) {
        chrome.storage.local.remove('punchPopupWindowId');
      }
      if (data.tsNotifWindowId === windowId) {
        chrome.storage.local.set({ tsNotifDismissedTs: Date.now() });
        chrome.storage.local.remove('tsNotifWindowId');
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

  function resetAllCaches() {
    resetGpPunchCache();
    resetSeniorApiCache();
    resetSeniorStorageCache();
    resetBackgroundHash();
  }

  function triggerReDetection(time: string) {
    addPendingPunch(time);
    resetAllCaches();
    backgroundDetect().catch(() => {});
    [5000, 12000, 25000].forEach(delay => {
      setTimeout(() => {
        resetAllCaches();
        backgroundDetect().catch(() => {});
      }, delay);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.pontoState) {
      const newState = changes.pontoState.newValue;
      chrome.storage.local.get('punchPopupSlot', (data) => {
        const slot = data.punchPopupSlot as PunchReminderSlot | null;
        if (!slot) return;
        if (newState?.[slot] || newState?.saida) {
          resolveReminder(slot).catch(() => {});
        }
      });
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
          backgroundDetect().catch(() => {});
        } else {
          debugLog('Background: falha ao renovar GP assertion');
        }
      }).catch(() => {});
    }
    if (changes.metaTsToken && changes.metaTsToken.newValue) {
      // Token capturado naturalmente via webRequest (usuário navegou na plataforma).
      // Atualiza cache de timesheet e em seguida verifica pendentes.
      debugLog('Background: metaTsToken capturado, sincronizando timesheet + verificando pendentes...');
      backgroundTimesheetSync()
        .then(() => notifyPendingTimesheet())
        .catch(() => {});
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
    backgroundDetect().catch(() => {});
  }).catch(() => {});
});
