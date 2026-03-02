export default defineContentScript({
  matches: ['*://platform.senior.com.br/*', '*://gestaoponto.meta.com.br/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    interceptFetch();
    interceptXHR();
  },
});

const PUNCH_URL_MATCH = 'clockingEventImportByBrowser';

function dispatchBearer(token: string) {
  if (token && typeof token === 'string' && token.length > 20) {
    window.dispatchEvent(new CustomEvent('__sponto_bearer', { detail: token }));
  }
}

function extractBearer(value: string | undefined, url: string) {
  if (!value || typeof value !== 'string' || !value.startsWith('Bearer ')) return;
  const urlStr = typeof url === 'string' ? url : '';
  if (urlStr.includes('senior.com.br')) {
    dispatchBearer(value.slice(7));
  }
}

function extractGestaoPonto(headers: Record<string, string> | Headers, url: string) {
  const urlStr = typeof url === 'string' ? url : '';
  if (!urlStr.includes('gestaoponto') || !urlStr.includes('/api/')) return;

  let assertion: string | null = null;
  if (headers instanceof Headers) {
    assertion = headers.get('assertion');
  } else if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'assertion') assertion = v;
    }
  }
  if (!assertion) return;

  const info: Record<string, string> = { assertion };
  const colabMatch = urlStr.match(/\/colaborador\/([^?/]+)/);
  if (colabMatch) info.colaboradorId = colabMatch[1];
  const calcMatch = urlStr.match(/codigoCalculo=(\d+)/);
  if (calcMatch) info.codigoCalculo = calcMatch[1];
  const baseMatch = urlStr.match(/(https?:\/\/[^/]+\/[^/]+-backend\/api\/)/);
  if (baseMatch) info.baseUrl = baseMatch[1];

  window.dispatchEvent(new CustomEvent('__sponto_gestao_ponto', { detail: JSON.stringify(info) }));
}

function spyRequest(url: string | URL | Request, method: string, body: unknown) {
  const urlStr = typeof url === 'string' ? url : (url && 'url' in url) ? url.url : '';
  if (!urlStr.includes('senior.com.br') && !urlStr.includes('gestaoponto')) return;
  const ul = urlStr.toLowerCase();
  if ((method === 'POST' || method === 'PUT') && (ul.includes('clocking') || ul.includes('pontomobile') || ul.includes('/ponto/'))) {
    const info = { url: urlStr, method, body: typeof body === 'string' ? body : JSON.stringify(body) };
    window.dispatchEvent(new CustomEvent('__sponto_api_spy', { detail: JSON.stringify(info) }));
  }
}

function interceptFetch() {
  const originalFetch = window.fetch;
  window.fetch = function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
    const method = (init?.method || 'GET').toUpperCase();
    const fetchUrl = typeof input === 'string' ? input : (input as Request).url || '';

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        extractBearer(init.headers.get('Authorization') ?? undefined, fetchUrl);
      } else if (typeof init.headers === 'object') {
        for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
          if (k.toLowerCase() === 'authorization') extractBearer(v, fetchUrl);
        }
      }
      extractGestaoPonto(init.headers as Record<string, string>, fetchUrl);
    }
    spyRequest(input, method, init?.body);

    const result = originalFetch.apply(this, [input, init]);
    if (fetchUrl.includes(PUNCH_URL_MATCH)) {
      (result as Promise<Response>).then(response => {
        if (response.ok) {
          window.dispatchEvent(new CustomEvent('__sponto_punch_success', {
            detail: JSON.stringify({ url: fetchUrl, timestamp: Date.now() }),
          }));
        }
      }).catch(() => {});
    }
    return result;
  };
}

function interceptXHR() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  type XHRWithMeta = XMLHttpRequest & { __sponto_method: string; __sponto_url: string; __sponto_headers: Record<string, string> };

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as XHRWithMeta).__sponto_method = method;
    (this as XHRWithMeta).__sponto_url = String(url);
    return originalOpen.apply(this, [method, url, ...rest] as Parameters<typeof originalOpen>);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
    if (name.toLowerCase() === 'authorization') extractBearer(value, (this as XHRWithMeta).__sponto_url || '');
    if (!(this as XHRWithMeta).__sponto_headers) (this as XHRWithMeta).__sponto_headers = {};
    (this as XHRWithMeta).__sponto_headers[name] = value;
    return originalSetHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    spyRequest((this as XHRWithMeta).__sponto_url || '', (this as XHRWithMeta).__sponto_method || '', body);
    if ((this as XHRWithMeta).__sponto_headers) {
      extractGestaoPonto((this as XHRWithMeta).__sponto_headers, (this as XHRWithMeta).__sponto_url || '');
    }
    return originalSend.apply(this, [body]);
  };
}
