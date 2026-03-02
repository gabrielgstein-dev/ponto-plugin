import { ENABLE_SENIOR_INTEGRATION, ENABLE_META_TIMESHEET } from '../lib/domain/build-flags';
import { handleDailyReset, handleReminderAlarm, handleNotifAlarm } from '../lib/application/handle-alarm';
import { backgroundDetect, resetBackgroundHash } from '../lib/application/background-detect';

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
        chrome.windows.getCurrent((win) => {
          if (win.id) chrome.sidePanel.open({ windowId: win.id }).then(() => sendResponse({ ok: true }));
        });
      }
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

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailyReset') { handleDailyReset(); return; }
    if (alarm.name === 'bgDetect') { backgroundDetect().catch(() => {}); return; }
    if (alarm.name.startsWith('reminder_')) { handleReminderAlarm(alarm.name); return; }
    if (alarm.name.startsWith('notif_')) { handleNotifAlarm(alarm.name); }
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.punchSuccessTs) {
      console.log('[Senior Ponto] Background: punch registrado, re-detectando...');
      resetBackgroundHash();
      [3000, 8000, 18000].forEach(delay => {
        setTimeout(() => {
          resetBackgroundHash();
          backgroundDetect().catch(() => {});
        }, delay);
      });
    }
  });

  backgroundDetect().catch(() => {});
});
