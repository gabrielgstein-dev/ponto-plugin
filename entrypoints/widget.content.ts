let _intervalIds: ReturnType<typeof setInterval>[] = [];
let _observer: MutationObserver | null = null;

function isContextValid(): boolean {
  try { return !!chrome.runtime && !!chrome.runtime.id; } catch (_) { return false; }
}

function cleanup() {
  _intervalIds.forEach(id => clearInterval(id));
  _intervalIds = [];
  if (_observer) { _observer.disconnect(); _observer = null; }
  const widget = document.getElementById('senior-ponto-widget');
  if (widget) widget.remove();
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    if (window.top !== window) return;
    injectWidget();
    listenStorageChanges();
    observeWidgetPresence();
    _intervalIds.push(setInterval(updateWidgetFromStorage, 30000));
  },
});

function injectWidget() {
  if (document.getElementById('senior-ponto-widget')) return;

  const widget = document.createElement('div');
  widget.id = 'senior-ponto-widget';
  widget.innerHTML = `
    <style>
      #senior-ponto-widget { position:fixed; bottom:20px; right:20px; z-index:99999; font-family:'Segoe UI',system-ui,sans-serif; }
      #spw-toggle { width:48px; height:48px; background:#0f1117; border:2px solid #4ade80; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(74,222,128,0.3); transition:all 0.2s; margin-left:auto; }
      #spw-toggle:hover { transform:scale(1.05); box-shadow:0 4px 24px rgba(74,222,128,0.5); }
      #spw-toggle svg { color:#4ade80; }
      #spw-panel { display:none; margin-bottom:8px; background:#0f1117; border:1px solid #2a2f40; border-radius:12px; padding:14px; width:220px; box-shadow:0 8px 32px rgba(0,0,0,0.5); margin-left:auto; }
      #spw-panel.open { display:block; }
      .spw-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:#4a5268; margin-bottom:10px; }
      .spw-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:4px 0; border-bottom:1px solid #1e2230; }
      .spw-row:last-child { border-bottom:none; margin-bottom:0; }
      .spw-label { font-size:10px; color:#8892a4; }
      .spw-time { font-size:14px; font-weight:700; font-family:'Courier New',monospace; color:#e8eaf0; }
      .spw-time.calc { color:#fbbf24; font-size:12px; }
      .spw-time.past { color:#4ade80; }
      .spw-time.next { color:#22d3ee; }
      .spw-clock { text-align:center; font-size:20px; font-weight:700; font-family:'Courier New',monospace; color:#e8eaf0; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #2a2f40; }
    </style>
    <div id="spw-panel">
      <div class="spw-clock" id="spw-live-clock">--:--:--</div>
      <div class="spw-title">Senior · Ponto</div>
      <div class="spw-row"><span class="spw-label">Entrada</span><span class="spw-time" id="spw-entrada">--:--</span></div>
      <div class="spw-row"><span class="spw-label">Almoço</span><span class="spw-time" id="spw-almoco">--:--</span></div>
      <div class="spw-row"><span class="spw-label">Volta</span><span class="spw-time" id="spw-volta">--:--</span></div>
      <div class="spw-row"><span class="spw-label">Saída</span><span class="spw-time" id="spw-saida">--:--</span></div>
    </div>
    <div id="spw-toggle">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </div>
  `;
  document.body.appendChild(widget);

  document.getElementById('spw-toggle')!.addEventListener('click', () => {
    document.getElementById('spw-panel')!.classList.toggle('open');
  });

  _intervalIds.push(setInterval(() => {
    const n = new Date();
    const el = document.getElementById('spw-live-clock');
    if (el) el.textContent = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
  }, 1000));

  updateWidgetFromStorage();
}

async function updateWidgetFromStorage() {
  if (!isContextValid()) { cleanup(); return; }
  try {
    const data = await chrome.storage.local.get(['pontoState', 'pontoSettings', 'pontoDate']);
    const today = new Date().toDateString();
    if (data.pontoDate !== today || !data.pontoState) return;

    const state = data.pontoState;
    const settings = data.pontoSettings || { jornada: 480, almocoHorario: '12:00', almocoDur: 60 };

    const t = (s: string | null) => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const fmt = (min: number | null) => { if (min == null) return null; return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; };

    const entMin = t(state.entrada);
    const almocoMin = t(state.almoco);
    const voltaMin = t(state.volta);
    const almocoHorarioMin = t(settings.almocoHorario) || 720;

    let saidaEstimada: string | null = null;
    if (voltaMin && entMin) {
      const antes = almocoMin ? almocoMin - entMin : 0;
      const actualLunch = almocoMin ? voltaMin - almocoMin : 0;
      const lunchDeficit = Math.max(0, settings.almocoDur - actualLunch);
      saidaEstimada = fmt(voltaMin + (settings.jornada - antes) + lunchDeficit);
    } else if (almocoMin && entMin) {
      saidaEstimada = fmt(almocoMin + settings.almocoDur + (settings.jornada - (almocoMin - entMin)));
    } else if (entMin) {
      saidaEstimada = fmt(entMin + settings.jornada + settings.almocoDur);
    }

    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const set = (id: string, val: string | null, isCalc: boolean) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val || '--:--';
      el.className = 'spw-time';
      if (isCalc) { el.classList.add('calc'); return; }
      const m = t(val);
      if (m != null && m < nowMin) el.classList.add('past');
      else if (m != null) el.classList.add('next');
    };

    set('spw-entrada', state.entrada, false);
    set('spw-almoco', state.almoco || fmt(almocoHorarioMin), !state.almoco);
    set('spw-volta', state.volta || (almocoMin ? fmt(almocoMin + settings.almocoDur) : null), !state.volta);
    set('spw-saida', state.saida || saidaEstimada, !state.saida);
  } catch (_) {
    cleanup();
  }
}

function listenStorageChanges() {
  try {
    chrome.storage.onChanged.addListener((changes: Record<string, unknown>, area: string) => {
      if (!isContextValid()) return;
      if (area !== 'local') return;
      if ((changes as Record<string, unknown>).pontoState || (changes as Record<string, unknown>).punchSuccessTs) {
        updateWidgetFromStorage();
      }
    });
  } catch (_) {}
}

function observeWidgetPresence() {
  let debounce: ReturnType<typeof setTimeout>;
  _observer = new MutationObserver(() => {
    if (!isContextValid()) { cleanup(); return; }
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (!document.getElementById('senior-ponto-widget')) injectWidget();
    }, 1000);
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}
