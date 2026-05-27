export default defineContentScript({
  matches: ['*://app.teamculture.com.br/*', '*://beta.teamculture.com.br/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    console.log('[SPonto-POC] TeamCulture spy loaded on', location.href);
    interceptFetch();
    interceptXHR();
    observeDOM();
  },
});

function interceptFetch() {
  const originalFetch = window.fetch;
  window.fetch = function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
    const method = (init?.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : (input as Request).url || '';

    const result = originalFetch.apply(this, [input, init]);

    (result as Promise<Response>).then(async (response) => {
      let body: string | null = null;
      try {
        const clone = response.clone();
        body = await clone.text();
        if (body.length > 2000) body = body.slice(0, 2000) + '…[truncated]';
      } catch { /* ignore */ }

      const payload = {
        type: 'fetch',
        method,
        url,
        status: response.status,
        body,
        timestamp: Date.now(),
      };
      console.log('[SPonto-POC] FETCH', method, url, response.status, body?.slice(0, 200));
      window.dispatchEvent(new CustomEvent('__sponto_tc_spy', { detail: JSON.stringify(payload) }));
    }).catch(() => {});

    return result;
  };
}

function interceptXHR() {
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any).__sponto_method = method;
    (this as any).__sponto_url = typeof url === 'string' ? url : url.toString();
    return origOpen.apply(this, [method, url, ...rest] as any);
  };

  OrigXHR.prototype.send = function (...args: any[]) {
    this.addEventListener('load', function () {
      let body = '';
      try {
        body = typeof this.responseText === 'string' ? this.responseText.slice(0, 2000) : '';
      } catch { /* ignore */ }

      const payload = {
        type: 'xhr',
        method: (this as any).__sponto_method,
        url: (this as any).__sponto_url,
        status: this.status,
        body,
        timestamp: Date.now(),
      };
      console.log('[SPonto-POC] XHR', payload.method, payload.url, this.status, body.slice(0, 200));
      window.dispatchEvent(new CustomEvent('__sponto_tc_spy', { detail: JSON.stringify(payload) }));
    });
    return origSend.apply(this, args as any);
  };
}

function observeDOM() {
  const seen = new Set<string>();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const tag = node.tagName?.toLowerCase();
        const cls = node.className || '';
        const txt = node.textContent?.slice(0, 120) || '';
        const key = `${tag}.${cls}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const interesting =
          /obrigado|sucesso|enviado|respondid|complet|thank|success|submit|done/i.test(txt) ||
          /modal|dialog|toast|snack|alert|success|complete/i.test(cls);

        if (interesting) {
          const payload = {
            type: 'dom',
            tag,
            class: cls,
            text: txt,
            timestamp: Date.now(),
          };
          console.log('[SPonto-POC] DOM interesting node:', tag, cls, txt.slice(0, 80));
          window.dispatchEvent(new CustomEvent('__sponto_tc_spy', { detail: JSON.stringify(payload) }));
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
}
