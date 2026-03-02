// Service Worker — gerencia notificações e interceptação de token

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Senior Ponto] Extensão instalada/atualizada.');
});

// ─── Interceptar token Bearer das requests do Senior ──────────
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const authHeader = details.requestHeaders.find(
      h => h.name.toLowerCase() === 'authorization'
    );
    if (authHeader && authHeader.value && authHeader.value.startsWith('Bearer ')) {
      const token = authHeader.value.slice(7);
      chrome.storage.local.set({ seniorToken: token, seniorTokenTs: Date.now() });
    }
  },
  { urls: ['https://platform.senior.com.br/*', 'https://*.senior.com.br/*'] },
  ['requestHeaders', 'extraHeaders']
);

// ─── Mensagens recebidas (apenas notificações) ───────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SHOW_NOTIFICATION') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: msg.title || 'Senior Ponto',
      message: msg.message || '',
      priority: 2,
      requireInteraction: false,
    }, (id) => {
      setTimeout(() => chrome.notifications.clear(id), 8000);
    });
    sendResponse({ ok: true });
    return true;
  }
});

// ─── Reset diário ─────────────────────────────────────────────
chrome.alarms.create('dailyReset', {
  when: getNextMidnight(),
  periodInMinutes: 24 * 60,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    chrome.alarms.getAll((alarms) => {
      alarms.forEach(a => {
        if (a.name.startsWith('notif_')) chrome.alarms.clear(a.name);
      });
    });
    chrome.storage.local.set({
      pontoState: null,
      pontoDate: new Date().toDateString(),
      seniorToken: null,
      seniorTokenTs: null,
    });
    console.log('[Senior Ponto] Estado resetado para o novo dia.');
    return;
  }

  if (alarm.name.startsWith('notif_')) {
    const msgKey = `alarm_msg_${alarm.name}`;
    chrome.storage.local.get([msgKey], (data) => {
      const msg = data[msgKey];
      if (!msg) return;
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Senior Ponto',
        message: msg,
        priority: 2,
        requireInteraction: false,
      }, (id) => {
        setTimeout(() => chrome.notifications.clear(id), 8000);
      });
      chrome.storage.local.remove(msgKey);
    });
  }
});

function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(now.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}
