/**
 * Captura de tráfego HTTP genérica para diagnóstico (DEV).
 *
 * Roda em DOIS mundos:
 *  - `installNetLogCapture()` no mundo MAIN: faz patch de `fetch` + `XHR` da
 *    página e dispara um CustomEvent com request/response completos.
 *  - `installNetLogForward()` no mundo ISOLATED: escuta esse evento e encaminha
 *    pro background (único writer do buffer `metaNetLog`).
 *
 * É host-agnóstico de propósito: o objetivo é descobrir endpoints novos
 * (ex.: migração Senior/Meta → INSI) sem saber a URL de antemão. Por isso os
 * content scripts que chamam isto casam em `<all_urls>` e ficam atrás da flag
 * de build `ENABLE_NETLOG_CAPTURE` (dev only).
 *
 * As entries vão pro mesmo buffer/export do antigo "tráfego Meta" — o storage
 * e o background já são agnósticos de host.
 */
import type { MetaNetEntry } from '../domain/meta-net-log';

export const NETLOG_EVENT = '__sponto_netlog';

const CAPTURE_GUARD = Symbol.for('__sponto_netlog_capture');
const FORWARD_GUARD = Symbol.for('__sponto_netlog_forward');

type GuardedWindow = Window & typeof globalThis & Record<symbol, boolean | undefined>;

/** Instala os patches de fetch/XHR no mundo MAIN. Idempotente por página. */
export function installNetLogCapture(): void {
  const w = window as GuardedWindow;
  if (w[CAPTURE_GUARD]) return;
  w[CAPTURE_GUARD] = true;
  interceptFetch();
  interceptXHR();
}

/** Escuta o evento de captura e encaminha pro background. Idempotente por página. */
export function installNetLogForward(): void {
  const w = window as GuardedWindow;
  if (w[FORWARD_GUARD]) return;
  w[FORWARD_GUARD] = true;
  window.addEventListener(NETLOG_EVENT, ((e: CustomEvent) => {
    if (!isContextValid()) return;
    try {
      const entry = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      chrome.runtime.sendMessage({ type: 'META_NETLOG_APPEND', entry }).catch(() => {});
    } catch (_) { /* ignore */ }
  }) as EventListener);
}

function isContextValid(): boolean {
  try { return !!chrome.runtime && !!chrome.runtime.id; } catch (_) { return false; }
}

function dispatchNetLog(entry: Omit<MetaNetEntry, 'reqBodyTruncated' | 'resBodyTruncated'>): void {
  try {
    window.dispatchEvent(new CustomEvent(NETLOG_EVENT, { detail: JSON.stringify(entry) }));
  } catch (_) { /* ignore */ }
}

function interceptFetch(): void {
  const originalFetch = window.fetch;
  window.fetch = function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
    const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url || '';

    const reqHeaders = headersToRecord(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const reqBody = serializeReqBody(init?.body);
    const startedAt = Date.now();

    const result = originalFetch.apply(this, [input, init]);

    (result as Promise<Response>).then(async response => {
      try {
        const clone = response.clone();
        const resBody = await safeReadResponseBody(clone);
        dispatchNetLog({
          ts: startedAt,
          kind: 'fetch',
          method,
          url,
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
        url,
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

function interceptXHR(): void {
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
