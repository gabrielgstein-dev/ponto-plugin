/**
 * fetch com timeout via AbortController.
 *
 * Sem timeout, requests pendurados podem travar UIs reativas (caso típico:
 * `useAutoDetect` setando `detecting=true` que nunca volta porque o fetch
 * ficou aguardando indefinidamente).
 */

export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`fetch timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 5000, signal: externalSignal, ...rest } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError' && !externalSignal?.aborted) {
      throw new FetchTimeoutError(timeoutMs);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export interface ResponseSummary {
  status: number;
  statusText: string;
  contentType: string | null;
  bodyPreview: string | null;
  bodyLength: number | null;
}

const RESPONSE_BODY_PREVIEW_LIMIT = 500;

/**
 * Snapshot enxuto de uma Response pra log de falha. Lê o body uma única vez
 * (consome o stream), trunca pra evitar dump gigante e captura content-type
 * + status. Caller deve usar isso APENAS depois que decidiu não usar o body
 * pra mais nada — o body fica consumido.
 *
 * Nunca lança: erro de leitura vira `bodyPreview: '<read error: ...>'`.
 */
export async function summarizeResponse(r: Response): Promise<ResponseSummary> {
  const contentType = r.headers.get('content-type');
  let bodyPreview: string | null = null;
  let bodyLength: number | null = null;
  try {
    const text = await r.text();
    bodyLength = text.length;
    bodyPreview = text.length > RESPONSE_BODY_PREVIEW_LIMIT
      ? text.slice(0, RESPONSE_BODY_PREVIEW_LIMIT) + `…[+${text.length - RESPONSE_BODY_PREVIEW_LIMIT}]`
      : text;
  } catch (e) {
    bodyPreview = `<read error: ${(e as Error).message}>`;
  }
  return {
    status: r.status,
    statusText: r.statusText,
    contentType,
    bodyPreview,
    bodyLength,
  };
}
