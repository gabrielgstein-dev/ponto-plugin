export default defineContentScript({
  matches: ['*://plataforma.meta.com.br/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    interceptMetaFetch();
    interceptMetaXHR();
  },
});

const TS_MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function isTimesheetMutation(url: string, method: string): boolean {
  const ul = url.toLowerCase();
  return TS_MUTATION_METHODS.includes(method.toUpperCase()) && (ul.includes('/timesheets/') || ul.includes('/reported-hours'));
}

function interceptMetaFetch() {
  const originalFetch = window.fetch;
  window.fetch = function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
    if (init?.headers) {
      const bearer = extractBearerFromHeaders(init.headers);
      if (bearer) {
        dispatchMetaToken(bearer);
      }
    }

    const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    const fetchUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url || '';

    const reqHeaders = headersToRecord(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const reqBody = serializeReqBody(init?.body);
    const startedAt = Date.now();

    const result = originalFetch.apply(this, [input, init]);

    if (isTimesheetMutation(fetchUrl, method)) {
      (result as Promise<Response>).then(response => {
        if (response.ok) {
          window.dispatchEvent(new CustomEvent('__sponto_ts_mutation', {
            detail: JSON.stringify({ url: fetchUrl, method, timestamp: Date.now() }),
          }));
        }
      }).catch(() => {});
    }

    (result as Promise<Response>).then(async response => {
      try {
        const clone = response.clone();
        const resBody = await safeReadResponseBody(clone);
        dispatchNetLog({
          ts: startedAt,
          kind: 'fetch',
          method,
          url: fetchUrl,
          reqHeaders,
          reqBody,
          status: response.status,
          statusText: response.statusText,
          resHeaders: headersToRecord(response.headers),
          resBody,
          durationMs: Date.now() - startedAt,
        });
      } catch (_) { /* ignore */ }
    }).catch(err => {
      dispatchNetLog({
        ts: startedAt,
        kind: 'fetch',
        method,
        url: fetchUrl,
        reqHeaders,
        reqBody,
        status: null,
        resHeaders: {},
        resBody: null,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    });

    return result;
  };
}

interface XHRMeta {
  method: string;
  url: string;
  reqHeaders: Record<string, string>;
  reqBody: string | null;
  startedAt: number;
}

function interceptMetaXHR() {
  const xhrProto = XMLHttpRequest.prototype;
  const originalOpen = xhrProto.open;
  const originalSend = xhrProto.send;
  const originalSetHeader = xhrProto.setRequestHeader;
  const metaKey = Symbol.for('__sponto_xhr_meta');

  type XHRWithMeta = XMLHttpRequest & { [k: symbol]: XHRMeta | undefined };

  xhrProto.open = function (this: XHRWithMeta, method: string, url: string | URL, ...rest: unknown[]) {
    this[metaKey] = {
      method: (method || 'GET').toUpperCase(),
      url: typeof url === 'string' ? url : url.toString(),
      reqHeaders: {},
      reqBody: null,
      startedAt: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalOpen.apply(this, [method, url, ...rest] as any);
  };

  xhrProto.setRequestHeader = function (this: XHRWithMeta, name: string, value: string) {
    const meta = this[metaKey];
    if (meta) meta.reqHeaders[name] = value;
    if (name.toLowerCase() === 'authorization' && value?.startsWith('Bearer ')) {
      dispatchMetaToken(value.slice(7));
    }
    return originalSetHeader.call(this, name, value);
  };

  xhrProto.send = function (this: XHRWithMeta, body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = this[metaKey];
    if (meta) {
      meta.reqBody = serializeReqBody(body ?? null);
      meta.startedAt = Date.now();
    }

    const onLoadEnd = () => {
      if (!meta) return;
      const resHeaders = parseResHeaders(this.getAllResponseHeaders());
      const resBody = safeReadXHRResponse(this);
      dispatchNetLog({
        ts: meta.startedAt,
        kind: 'xhr',
        method: meta.method,
        url: meta.url,
        reqHeaders: meta.reqHeaders,
        reqBody: meta.reqBody,
        status: this.status || null,
        statusText: this.statusText,
        resHeaders,
        resBody,
        durationMs: Date.now() - meta.startedAt,
        error: this.status === 0 ? 'network error / aborted' : undefined,
      });
    };

    this.addEventListener('loadend', onLoadEnd, { once: true });
    return originalSend.call(this, body as XMLHttpRequestBodyInit | null);
  };
}

function extractBearerFromHeaders(headers: HeadersInit): string | null {
  if (headers instanceof Headers) {
    const auth = headers.get('Authorization') || headers.get('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) {
      if (k.toLowerCase() === 'authorization' && v?.startsWith('Bearer ')) return v.slice(7);
    }
  } else if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, string>)) {
      if (k.toLowerCase() === 'authorization' && v?.startsWith('Bearer ')) return v.slice(7);
    }
  }
  return null;
}

function dispatchMetaToken(token: string) {
  if (token && typeof token === 'string' && token.length > 20) {
    window.dispatchEvent(new CustomEvent('__sponto_meta_token', { detail: token }));
  }
}

function dispatchNetLog(entry: Record<string, unknown>) {
  try {
    window.dispatchEvent(new CustomEvent('__sponto_meta_netlog', {
      detail: JSON.stringify(entry),
    }));
  } catch (_) { /* ignore */ }
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((v, k) => { out[k] = v; });
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) out[k] = String(v);
  } else if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, string>)) out[k] = String(v);
  }
  return out;
}

function parseResHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const line of raw.trim().split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function serializeReqBody(body: BodyInit | Document | null | undefined): string | null {
  if (body == null) return null;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) {
    const obj: Record<string, string> = {};
    body.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : `[file:${(v as File).name}]`; });
    return JSON.stringify(obj);
  }
  if (body instanceof Blob) return `[blob:${body.size}b ${body.type}]`;
  if (body instanceof ArrayBuffer) return `[arraybuffer:${body.byteLength}b]`;
  if (ArrayBuffer.isView(body)) return `[bufferview:${(body as ArrayBufferView).byteLength}b]`;
  try { return JSON.stringify(body); } catch { return String(body); }
}

async function safeReadResponseBody(response: Response): Promise<string | null> {
  try {
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('json') || ct.includes('text') || ct.includes('xml') || ct.includes('javascript') || ct.includes('html')) {
      return await response.text();
    }
    const blob = await response.blob();
    return `[binary:${blob.size}b ${blob.type || 'unknown'}]`;
  } catch (_) {
    return null;
  }
}

function safeReadXHRResponse(xhr: XMLHttpRequest): string | null {
  try {
    const type = xhr.responseType;
    if (type === '' || type === 'text') return xhr.responseText;
    if (type === 'json') {
      try { return JSON.stringify(xhr.response); } catch { return String(xhr.response); }
    }
    if (type === 'document') return xhr.responseXML?.documentElement?.outerHTML ?? null;
    if (type === 'blob') {
      const b = xhr.response as Blob | null;
      return b ? `[blob:${b.size}b ${b.type || 'unknown'}]` : null;
    }
    if (type === 'arraybuffer') {
      const b = xhr.response as ArrayBuffer | null;
      return b ? `[arraybuffer:${b.byteLength}b]` : null;
    }
    return null;
  } catch (_) {
    return null;
  }
}
