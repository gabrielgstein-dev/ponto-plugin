import { ENABLE_SENIOR_INTEGRATION, ENABLE_META_TIMESHEET } from '../lib/domain/build-flags';
import { debugLog } from '../lib/domain/debug';
import { handleDailyReset, handleReminderAlarm, handleNotifAlarm } from '../lib/application/handle-alarm';
import { backgroundDetect, resetBackgroundHash, notifyPendingTimesheet } from '../lib/application/background-detect';
import { handleTsAlarm } from '../lib/application/schedule-ts-notifications';
import { addPendingPunch, loadPendingPunches } from '../lib/application/detect-punches';
import { resetGpPunchCache } from '#company/providers';
import { resetSeniorApiCache } from '../lib/infrastructure/senior/senior-api-provider';
import { resetSeniorStorageCache } from '../lib/infrastructure/senior/senior-storage-provider';
import { getGpAssertion } from '../lib/infrastructure/meta/gestaoponto/gp-auth';

export default defineBackground(() => {
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
        if (data.tsNotifWindowId) {
          chrome.windows.remove(data.tsNotifWindowId, () => {
            chrome.storage.local.remove('tsNotifWindowId');
            sendResponse({ ok: true });
          });
        } else if (sender.tab?.windowId) {
          chrome.windows.remove(sender.tab.windowId, () => {
            sendResponse({ ok: true });
          });
        } else {
          sendResponse({ ok: false });
        }
      });
      return true;
    }
    if (message.type === 'TEST_TS_NOTIFICATION') {
      notifyPendingTimesheet().catch(() => {});
      sendResponse({ ok: true });
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
    if (alarm.name === 'bgDetect') { backgroundDetect().catch(() => {}); return; }
    if (alarm.name.startsWith('reminder_')) { handleReminderAlarm(alarm.name); return; }
    if (alarm.name.startsWith('notif_')) { handleNotifAlarm(alarm.name); return; }
    if (alarm.name.startsWith('ts_')) { handleTsAlarm(alarm.name); }
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

  chrome.alarms.create('bgDetect', { periodInMinutes: 2 });

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
      debugLog('Background: metaTsToken capturado, verificando timesheet pendente...');
      notifyPendingTimesheet().catch(() => {});
    }
    if (changes.seniorPunchApi && !changes.punchSuccessTs) {
      const info = changes.seniorPunchApi.newValue;
      const url = (info?.url || '').toLowerCase();
      if (url.includes('import') || url.includes('register') || url.includes('registrar')) {
        const now = new Date();
        const fallbackTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        debugLog(`Background: punch API detectada via spy (${fallbackTime}), re-detectando...`);
        triggerReDetection(fallbackTime);
      }
    }
  });

  loadPendingPunches().then(() => backgroundDetect()).catch(() => {});
});
