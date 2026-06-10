/**
 * Ring buffer para logar TODAS as requests da SPA plataforma.meta.com.br.
 *
 * Feature temporária de diagnóstico. Captura request/response completos
 * (URL, method, headers, body, status, duração). Bodies são truncados em
 * MAX_BODY_BYTES para não estourar a cota do chrome.storage.local.
 *
 * O background é o único contexto que escreve aqui — o content script
 * encaminha entries via runtime.sendMessage.
 */

const STORAGE_KEY = 'metaNetLog';
const MAX_ENTRIES = 200;
const MAX_BODY_BYTES = 32 * 1024;
const FLUSH_DEBOUNCE_MS = 500;

export interface MetaNetEntry {
  ts: number;
  kind: 'fetch' | 'xhr';
  method: string;
  url: string;
  reqHeaders: Record<string, string>;
  reqBody: string | null;
  reqBodyTruncated?: boolean;
  status: number | null;
  statusText?: string;
  resHeaders: Record<string, string>;
  resBody: string | null;
  resBodyTruncated?: boolean;
  durationMs: number;
  error?: string;
}

let buffer: MetaNetEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let mergedFromStorage = false;

async function mergeFromStorage(): Promise<void> {
  if (mergedFromStorage) return;
  mergedFromStorage = true;
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const stored = data[STORAGE_KEY];
    if (Array.isArray(stored)) {
      buffer = [...(stored as MetaNetEntry[]), ...buffer].slice(-MAX_ENTRIES);
    }
  } catch (_) { /* storage indisponível */ }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: buffer });
    } catch (_) { /* ignore */ }
  }, FLUSH_DEBOUNCE_MS);
}

function truncateBody(body: string | null): { body: string | null; truncated: boolean } {
  if (body == null) return { body: null, truncated: false };
  if (body.length <= MAX_BODY_BYTES) return { body, truncated: false };
  return { body: body.slice(0, MAX_BODY_BYTES), truncated: true };
}

export function sanitizeEntry(raw: MetaNetEntry): MetaNetEntry {
  const req = truncateBody(raw.reqBody);
  const res = truncateBody(raw.resBody);
  return {
    ...raw,
    reqBody: req.body,
    reqBodyTruncated: req.truncated || undefined,
    resBody: res.body,
    resBodyTruncated: res.truncated || undefined,
  };
}

export async function appendNetEntry(entry: MetaNetEntry): Promise<void> {
  await mergeFromStorage();
  buffer.push(sanitizeEntry(entry));
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES);
  scheduleFlush();
}

export async function getNetEntries(): Promise<MetaNetEntry[]> {
  await mergeFromStorage();
  return [...buffer];
}

export async function clearNetEntries(): Promise<void> {
  buffer = [];
  mergedFromStorage = true;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (_) { /* ignore */ }
}

/* v8 ignore next 8 -- helper apenas para testes */
export function _resetForTests(): void {
  buffer = [];
  mergedFromStorage = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
