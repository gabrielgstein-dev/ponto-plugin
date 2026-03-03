function isContextValid(): boolean {
  try { return !!chrome.runtime && !!chrome.runtime.id; } catch (_) { return false; }
}

export default defineContentScript({
  matches: ['*://plataforma.meta.com.br/*'],
  runAt: 'document_idle',

  main() {
    if (window.top !== window) return;
    captureMetaTokens();
    captureTimesheetMutations();
    autoClickColaborador();
  },
});

function captureMetaTokens() {
  window.addEventListener('__sponto_meta_token', ((e: CustomEvent) => {
    if (!isContextValid()) return;
    try {
      const token = typeof e.detail === 'string' ? e.detail : null;
      if (token && token.length > 20) {
        const save: Record<string, unknown> = {
          metaTsToken: token,
          metaTsTokenTs: Date.now(),
        };

        const uuid = extractMetaUUID(token);
        if (uuid) save.metaTsMetaUUID = uuid;

        chrome.storage.local.set(save);
      }
    } catch (_) {}
  }) as EventListener);
}

function captureTimesheetMutations() {
  window.addEventListener('__sponto_ts_mutation', ((e: CustomEvent) => {
    if (!isContextValid()) return;
    try {
      const info = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      chrome.storage.local.set({ tsMutationTs: Date.now(), tsMutationInfo: info });
    } catch (_) {}
  }) as EventListener);
}

function autoClickColaborador() {
  const tryClick = () => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.toLowerCase().includes('colaborador')) {
        btn.click();
        return true;
      }
    }
    return false;
  };

  if (tryClick()) return;

  const observer = new MutationObserver(() => {
    if (tryClick()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

function extractMetaUUID(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.metaUUID || null;
  } catch (_) {
    return null;
  }
}
