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
      #senior-ponto-widget { position:fixed; bottom:20px; right:20px; z-index:99999; font-family:'Segoe UI',system-ui,sans-serif; user-select:none; will-change:transform; }
      #senior-ponto-widget.spw-dragging { transition:none !important; }
      #spw-toggle { touch-action:none; }
      #spw-toggle { width:48px; height:48px; background:#0f1117; border:2px solid #4ade80; border-radius:50%; cursor:grab; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(74,222,128,0.3); margin-left:auto; }
      #spw-toggle:active { cursor:grabbing; }
      #spw-toggle:hover { transform:scale(1.05); box-shadow:0 4px 24px rgba(74,222,128,0.5); }
      #spw-toggle svg { color:#4ade80; }
      #spw-panel { display:none; position:absolute; background:#0f1117; border:1px solid #2a2f40; border-radius:12px; padding:14px; width:220px; box-shadow:0 8px 32px rgba(0,0,0,0.5); }
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

  setupDrag(widget);

  _intervalIds.push(setInterval(() => {
    const n = new Date();
    const el = document.getElementById('spw-live-clock');
    if (el) el.textContent = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
  }, 1000));

  restoreWidgetPosition(widget);
  updateWidgetFromStorage();
}

const DRAG_THRESHOLD = 5;
let _wasDragged = false;

function setupDrag(widget: HTMLElement) {
  const toggle = document.getElementById('spw-toggle')!;
  let dragging = false;
  let wasOpen = false;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let rafId = 0;

  function applyTransform() {
    widget.style.transform = `translate3d(${dx}px,${dy}px,0)`;
  }

  function onStart(cx: number, cy: number) {
    const panel = document.getElementById('spw-panel')!;
    wasOpen = panel.classList.contains('open');
    startX = cx;
    startY = cy;
    dx = 0;
    dy = 0;
    _wasDragged = false;
    dragging = true;
  }

  function onMove(cx: number, cy: number) {
    if (!dragging) return;
    dx = cx - startX;
    dy = cy - startY;
    if (!_wasDragged && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    if (!_wasDragged) {
      _wasDragged = true;
      widget.classList.add('spw-dragging');
      document.getElementById('spw-panel')!.classList.remove('open');
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(applyTransform);
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(rafId);
    widget.classList.remove('spw-dragging');
    if (_wasDragged) {
      commitPosition(widget, dx, dy);
      saveWidgetPosition(widget);
      if (wasOpen) togglePanel(widget);
    } else {
      togglePanel(widget);
    }
  }

  toggle.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    toggle.setPointerCapture(e.pointerId);
    onStart(e.clientX, e.clientY);
  });
  toggle.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    onMove(e.clientX, e.clientY);
  });
  toggle.addEventListener('pointerup', (e: PointerEvent) => {
    toggle.releasePointerCapture(e.pointerId);
    onEnd();
  });
  toggle.addEventListener('pointercancel', (e: PointerEvent) => {
    toggle.releasePointerCapture(e.pointerId);
    onEnd();
  });
}

function commitPosition(widget: HTMLElement, dx: number, dy: number) {
  const r = widget.getBoundingClientRect();
  const t = document.getElementById('spw-toggle')!;
  const maxX = window.innerWidth - t.offsetWidth;
  const maxY = window.innerHeight - t.offsetHeight;
  const x = Math.max(0, Math.min(r.left, maxX));
  const y = Math.max(0, Math.min(r.top, maxY));
  widget.style.transform = 'none';
  widget.style.left = `${x}px`;
  widget.style.top = `${y}px`;
  widget.style.right = 'auto';
  widget.style.bottom = 'auto';
}

function togglePanel(widget: HTMLElement) {
  const panel = document.getElementById('spw-panel')!;
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
    return;
  }

  const toggle = document.getElementById('spw-toggle')!;
  const tr = toggle.getBoundingClientRect();
  const openAbove = tr.bottom + 260 > window.innerHeight;
  const openLeft = tr.right + 220 > window.innerWidth;

  if (openAbove) {
    panel.style.bottom = `${toggle.offsetHeight + 8}px`;
    panel.style.top = 'auto';
  } else {
    panel.style.top = `${toggle.offsetHeight + 8}px`;
    panel.style.bottom = 'auto';
  }

  if (openLeft) {
    panel.style.right = '0';
    panel.style.left = 'auto';
  } else {
    panel.style.left = '0';
    panel.style.right = 'auto';
  }

  panel.classList.add('open');
}

function saveWidgetPosition(widget: HTMLElement) {
  if (!isContextValid()) return;
  const r = widget.getBoundingClientRect();
  const pos = {
    xPct: r.left / window.innerWidth,
    yPct: r.top / window.innerHeight,
  };
  chrome.storage.local.set({ widgetPosition: pos });
}

async function restoreWidgetPosition(widget: HTMLElement) {
  if (!isContextValid()) return;
  try {
    const data = await chrome.storage.local.get(['widgetPosition']);
    if (!data.widgetPosition) return;
    const { xPct, yPct } = data.widgetPosition;
    const x = xPct * window.innerWidth;
    const y = yPct * window.innerHeight;
    const r = widget.getBoundingClientRect();
    const maxX = window.innerWidth - r.width;
    const maxY = window.innerHeight - r.height;
    widget.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    widget.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
  } catch (_) {}
}

async function updateWidgetFromStorage() {
  if (!isContextValid()) { cleanup(); return; }
  try {
    const data = await chrome.storage.local.get(['pontoState', 'pontoDate']);
    const today = new Date().toDateString();
    if (data.pontoDate !== today || !data.pontoState) return;

    const s = data.pontoState;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    const toMin = (v: string | null) => {
      if (!v) return null;
      const [h, m] = v.split(':').map(Number);
      return h * 60 + m;
    };

    const set = (id: string, val: string | null, isCalc: boolean) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val || '--:--';
      el.className = 'spw-time';
      if (isCalc) { el.classList.add('calc'); return; }
      const m = toMin(val);
      if (m != null && m < nowMin) el.classList.add('past');
      else if (m != null) el.classList.add('next');
    };

    set('spw-entrada', s.entrada, false);
    set('spw-almoco', s.almoco ?? s._almocoSugerido ?? null, !s.almoco);
    set('spw-volta', s.volta ?? s._voltaSugerida ?? null, !s.volta);
    set('spw-saida', s.saida ?? s._saidaEstimada ?? null, !s.saida);
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
