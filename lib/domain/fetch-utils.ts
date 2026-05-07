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
