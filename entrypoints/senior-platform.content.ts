import { debugLog } from '../lib/domain/debug';

function isContextValid(): boolean {
  try { return !!chrome.runtime && !!chrome.runtime.id; } catch (_) { return false; }
}

export default defineContentScript({
  matches: ['*://platform.senior.com.br/*'],
  runAt: 'document_idle',

  main() {
    if (window.top !== window) return;
    setupScrapeListener();
    capturePageTokens();
  },
});

function setupScrapeListener() {
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!isContextValid()) return;
      if (msg.type === 'SCRAPE_TIMES') {
        const times = scrapePunchTimes();
        sendResponse({ times });
      }
    });
  } catch (_) {}
}

function scrapePunchTimes(): string[] {
  const times: string[] = [];
  const timePattern = /\b([0-1]?\d|2[0-3]):([0-5]\d)\b/;

  function parseTime(text: string | null): string | null {
    const m = text?.trim().match(timePattern);
    if (!m) return null;
    const h = parseInt(m[1]);
    if (h < 5 || h > 22) return null;
    return `${String(h).padStart(2, '0')}:${String(parseInt(m[2])).padStart(2, '0')}`;
  }

  const selectors = [
    'table td[class*="marcac"]', 'table td[class*="batimento"]', 'table td[class*="horario"]', 'table td[class*="hora"]',
    '[class*="marcacao"] span', '[class*="batimento"] span', '[class*="ponto"] td', '[class*="ponto"] span',
    '[class*="clocking"] span', '[class*="clocking"] td', '[class*="event"] td', 'table td', 'table th',
  ];

  for (const sel of selectors) {
    const els = Array.from(document.querySelectorAll(sel));
    if (sel === 'table td' || sel === 'table th') {
      els.filter(el => /^\s*([0-1]?\d|2[0-3]):[0-5]\d\s*$/.test(el.textContent || ''))
        .forEach(el => { const t = parseTime(el.textContent); if (t) times.push(t); });
    } else {
      els.forEach(el => { const t = parseTime(el.textContent); if (t) times.push(t); });
    }
    if (times.length > 0) break;
  }

  if (times.length === 0) {
    const globalPattern = /\b([0-1]?\d|2[0-3]):([0-5]\d)\b/g;
    const allText = document.body.innerText || '';
    let match;
    while ((match = globalPattern.exec(allText)) !== null) {
      const h = parseInt(match[1]);
      if (h >= 5 && h <= 22) times.push(`${String(h).padStart(2, '0')}:${String(parseInt(match[2])).padStart(2, '0')}`);
    }
  }

  return [...new Set(times)].sort();
}


function capturePageTokens() {
  window.addEventListener('__sponto_bearer', ((e: CustomEvent) => {
    if (!isContextValid()) return;
    try {
      const token = typeof e.detail === 'string' ? e.detail : e.detail?.token;
      if (token && token.length > 20) {
        chrome.storage.local.set({ seniorBearerToken: token, seniorBearerTs: Date.now() });
      }
    } catch (_) {}
  }) as EventListener);

  window.addEventListener('__sponto_api_spy', ((e: CustomEvent) => {
    if (!isContextValid()) return;
    try {
      const info = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      chrome.storage.local.set({ seniorPunchApi: info, seniorPunchApiTs: Date.now() });
    } catch (_) {}
  }) as EventListener);

  window.addEventListener('__sponto_gestao_ponto', ((e: CustomEvent) => {
    if (!isContextValid()) return;
    try {
      const info = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      const save: Record<string, unknown> = { gestaoPontoTs: Date.now() };
      if (info.assertion) save.gestaoPontoAssertion = info.assertion;
      if (info.colaboradorId) save.gestaoPontoColaboradorId = info.colaboradorId;
      if (info.codigoCalculo) save.gestaoPontoCodigoCalculo = info.codigoCalculo;
      if (info.baseUrl) save.gestaoPontoBaseUrl = info.baseUrl;
      chrome.storage.local.set(save);
    } catch (_) {}
  }) as EventListener);

  window.addEventListener('__sponto_punch_success', ((e: CustomEvent) => {
    if (!isContextValid()) return;
    try {
      const save: Record<string, unknown> = { punchSuccessTs: Date.now() };
      const info = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      if (info?.punchTime) save.punchSuccessTime = info.punchTime;
      debugLog('Punch success interceptado:', info?.punchTime || 'sem horário');
      chrome.storage.local.set(save);
    } catch (_) {}
  }) as EventListener);
}
