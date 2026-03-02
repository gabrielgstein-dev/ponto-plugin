// Content Script — roda na página da Senior Platform
// Injeta um widget flutuante e detecta automaticamente batimentos

(function () {
  'use strict';

  if (window.__seniorPontoInjected) return;
  window.__seniorPontoInjected = true;

  let _intervalIds = [];
  let _observer = null;

  function isContextValid() {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  function cleanup() {
    _intervalIds.forEach(id => clearInterval(id));
    _intervalIds = [];
    if (_observer) { _observer.disconnect(); _observer = null; }
    const widget = document.getElementById('senior-ponto-widget');
    if (widget) widget.remove();
    window.__seniorPontoInjected = false;
  }

  let widgetState = {
    visible: false,
    times: [],
    calculated: null,
  };

  // ─── Detectar batimentos no DOM ───────────────────────────────
  function extractTimes() {
    const timePattern = /\b([0-1]?\d|2[0-3]):([0-5]\d)\b/;
    const times = [];

    function parseTime(text) {
      const m = text && text.trim().match(timePattern);
      if (!m) return null;
      const h = parseInt(m[1]);
      const min = parseInt(m[2]);
      if (h < 5 || h > 22) return null;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    function collectFromElements(elements) {
      elements.forEach(el => {
        const t = parseTime(el.textContent);
        if (t) times.push(t);
      });
    }

    const specificSelectors = [
      'table td[class*="marcac"]',
      'table td[class*="batimento"]',
      'table td[class*="horario"]',
      'table td[class*="hora"]',
      '[class*="marcacao"] span',
      '[class*="batimento"] span',
      '[class*="ponto"] td',
      '[class*="ponto"] span',
      '[class*="clocking"] span',
      '[class*="clocking"] td',
      '[class*="event"] td',
      'table td',
      'table th',
    ];

    for (const selector of specificSelectors) {
      const els = Array.from(document.querySelectorAll(selector));
      if (selector === 'table td' || selector === 'table th') {
        // Para seletores genéricos, filtra células cujo texto seja SOMENTE um horário
        const onlyTime = els.filter(el => /^\s*([0-1]?\d|2[0-3]):[0-5]\d\s*$/.test(el.textContent));
        collectFromElements(onlyTime);
      } else {
        collectFromElements(els);
      }
      if (times.length > 0) break;
    }

    // Fallback: varrer todo o texto da página
    if (times.length === 0) {
      const globalPattern = /\b([0-1]?\d|2[0-3]):([0-5]\d)\b/g;
      const allText = document.body.innerText || '';
      let match;
      while ((match = globalPattern.exec(allText)) !== null) {
        const h = parseInt(match[1]);
        const min = parseInt(match[2]);
        if (h >= 5 && h <= 22) {
          times.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
        }
      }
    }

    return [...new Set(times)].sort();
  }

  // ─── Carregar configurações ───────────────────────────────────
  async function loadSettings() {
    if (!isContextValid()) { cleanup(); return null; }
    try {
      const data = await chrome.storage.local.get(['pontoSettings', 'pontoState', 'pontoDate']);
      const today = new Date().toDateString();
      const settings = data.pontoSettings || {
        jornada: 480,
        almocoHorario: '12:00',
        almocoDur: 60,
        notifAntecip: 10,
      };
      const state = (data.pontoDate === today && data.pontoState) ? data.pontoState : {};
      return { settings, state };
    } catch (e) {
      cleanup();
      return null;
    }
  }

  // ─── Calcular horários ────────────────────────────────────────
  function calcHorarios(state, settings) {
    const t = (s) => {
      if (!s) return null;
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    };
    const fmt = (min) => {
      if (min == null) return null;
      return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    };

    const entMin = t(state.entrada);
    if (!entMin) return null;

    const almocoMin = t(state.almoco);
    const voltaMin = t(state.volta);
    const almocoHorarioMin = t(settings.almocoHorario) || 720;

    let saidaEstimada = null;
    let almocoSug = fmt(almocoHorarioMin);
    let voltaSug = almocoMin ? fmt(almocoMin + settings.almocoDur) : null;

    if (voltaMin) {
      const antes = almocoMin ? almocoMin - entMin : 0;
      const actualLunch = almocoMin ? voltaMin - almocoMin : 0;
      const lunchDeficit = Math.max(0, settings.almocoDur - actualLunch);
      const rest = settings.jornada - antes;
      saidaEstimada = fmt(voltaMin + rest + lunchDeficit);
    } else if (almocoMin) {
      const antes = almocoMin - entMin;
      const rest = settings.jornada - antes;
      saidaEstimada = fmt(almocoMin + settings.almocoDur + rest);
    } else {
      saidaEstimada = fmt(entMin + settings.jornada + settings.almocoDur);
    }

    return {
      entrada: state.entrada,
      almoco: state.almoco || almocoSug,
      volta: state.volta || voltaSug,
      saida: state.saida || saidaEstimada,
      almocoIsCalc: !state.almoco,
      voltaIsCalc: !state.volta,
      saidaIsCalc: !state.saida,
    };
  }

  // ─── Criar widget flutuante ───────────────────────────────────
  function createWidget() {
    if (document.getElementById('senior-ponto-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'senior-ponto-widget';
    widget.innerHTML = `
      <style>
        #senior-ponto-widget {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 99999;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }

        #spw-toggle {
          width: 48px;
          height: 48px;
          background: #0f1117;
          border: 2px solid #4ade80;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
          transition: all 0.2s;
          margin-left: auto;
        }

        #spw-toggle:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 24px rgba(74, 222, 128, 0.5);
        }

        #spw-toggle svg { color: #4ade80; }

        #spw-panel {
          display: none;
          margin-bottom: 8px;
          background: #0f1117;
          border: 1px solid #2a2f40;
          border-radius: 12px;
          padding: 14px;
          width: 220px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          margin-left: auto;
        }

        #spw-panel.open { display: block; }

        .spw-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #4a5268;
          margin-bottom: 10px;
        }

        .spw-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          padding: 4px 0;
          border-bottom: 1px solid #1e2230;
        }

        .spw-row:last-child { border-bottom: none; margin-bottom: 0; }

        .spw-label {
          font-size: 10px;
          color: #8892a4;
        }

        .spw-time {
          font-size: 14px;
          font-weight: 700;
          font-family: 'Courier New', monospace;
          color: #e8eaf0;
        }

        .spw-time.calc { color: #fbbf24; font-size: 12px; }
        .spw-time.past { color: #4ade80; }
        .spw-time.next { color: #22d3ee; }

        .spw-clock {
          text-align: center;
          font-size: 20px;
          font-weight: 700;
          font-family: 'Courier New', monospace;
          color: #e8eaf0;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #2a2f40;
        }
      </style>

      <div id="spw-panel">
        <div class="spw-clock" id="spw-live-clock">--:--:--</div>
        <div class="spw-title">Senior · Ponto</div>
        <div class="spw-row">
          <span class="spw-label">Entrada</span>
          <span class="spw-time" id="spw-entrada">--:--</span>
        </div>
        <div class="spw-row">
          <span class="spw-label">Almoço</span>
          <span class="spw-time" id="spw-almoco">--:--</span>
        </div>
        <div class="spw-row">
          <span class="spw-label">Volta</span>
          <span class="spw-time" id="spw-volta">--:--</span>
        </div>
        <div class="spw-row">
          <span class="spw-label">Saída</span>
          <span class="spw-time" id="spw-saida">--:--</span>
        </div>
      </div>

      <div id="spw-toggle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
    `;

    document.body.appendChild(widget);

    // Toggle
    document.getElementById('spw-toggle').addEventListener('click', () => {
      const panel = document.getElementById('spw-panel');
      panel.classList.toggle('open');
    });

    // Relógio ao vivo
    _intervalIds.push(setInterval(() => {
      const n = new Date();
      const el = document.getElementById('spw-live-clock');
      if (el) {
        el.textContent = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
      }
    }, 1000));
  }

  // ─── Atualizar widget com dados ───────────────────────────────
  async function updateWidget() {
    if (!isContextValid()) { cleanup(); return; }
    try {
      const loaded = await loadSettings();
      if (!loaded) return;
      const { settings, state } = loaded;
      const calc = calcHorarios(state, settings);
      if (!calc) return;

      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const t = (s) => { if (!s) return 9999; const [h,m] = s.split(':').map(Number); return h*60+m; };

      const set = (id, val, isCalc) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = val || '--:--';
        el.className = 'spw-time';
        if (isCalc) { el.classList.add('calc'); return; }
        if (t(val) < nowMin) el.classList.add('past');
        else el.classList.add('next');
      };

      set('spw-entrada', calc.entrada, false);
      set('spw-almoco', calc.almoco, calc.almocoIsCalc);
      set('spw-volta', calc.volta, calc.voltaIsCalc);
      set('spw-saida', calc.saida, calc.saidaIsCalc);
    } catch (e) {
      cleanup();
    }
  }

  // ─── Observar mudanças no DOM (SPA) ───────────────────────────
  let updateDebounce;
  _observer = new MutationObserver(() => {
    if (!isContextValid()) { cleanup(); return; }
    clearTimeout(updateDebounce);
    updateDebounce = setTimeout(updateWidget, 1000);
  });

  _observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // ─── Init ──────────────────────────────────────────────────────
  function init() {
    if (window.top === window) {
      createWidget();
      updateWidget();
      _intervalIds.push(setInterval(updateWidget, 30000));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Ouvir mensagem do popup solicitando scrape
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!isContextValid()) return;
      if (msg.type === 'SCRAPE_TIMES') {
        const times = extractTimes();
        sendResponse({ times });
      }
    });
  } catch (e) {
    cleanup();
  }

  // ─── Receber token Bearer do interceptor.js (world: MAIN) ──────
  window.addEventListener('__sponto_bearer', (e) => {
    if (!isContextValid()) return;
    try {
      const token = e.detail;
      if (token && token.length > 20) {
        console.log('[Senior Ponto] Bearer token capturado pelo interceptor:', token.substring(0, 30) + '...');
        chrome.storage.local.set({ seniorBearerToken: token, seniorBearerTs: Date.now() });
      }
    } catch (err) {}
  });

  window.addEventListener('__sponto_api_spy', (e) => {
    if (!isContextValid()) return;
    try {
      const info = JSON.parse(e.detail);
      chrome.storage.local.set({ seniorPunchApi: info, seniorPunchApiTs: Date.now() });
    } catch (err) {}
  });

  window.addEventListener('__sponto_gestao_ponto', (e) => {
    if (!isContextValid()) return;
    try {
      const info = JSON.parse(e.detail);
      const data = { gestaoPontoTs: Date.now() };
      if (info.assertion) data.gestaoPontoAssertion = info.assertion;
      if (info.colaboradorId) data.gestaoPontoColaboradorId = info.colaboradorId;
      if (info.codigoCalculo) data.gestaoPontoCodigoCalculo = info.codigoCalculo;
      if (info.baseUrl) data.gestaoPontoBaseUrl = info.baseUrl;
      console.log('[Senior Ponto] GestaoPonto config salvo:', Object.keys(data).join(', '));
      chrome.storage.local.set(data);
    } catch (err) {}
  });

  window.addEventListener('__sponto_punch_success', (e) => {
    if (!isContextValid()) return;
    try {
      console.log('[Senior Ponto] Ponto batido na plataforma — notificando extensão');
      chrome.storage.local.set({ punchSuccessTs: Date.now() });
    } catch (err) {}
  });

})();
