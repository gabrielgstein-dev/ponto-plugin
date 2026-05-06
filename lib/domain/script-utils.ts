/**
 * `chrome.scripting.executeScript` com timeout via Promise.race.
 *
 * Sem timeout, scripts injetados que pendurarem (aba não responde, fetch
 * interno trava, página em estado intermediário) deixam callers aguardando
 * indefinidamente. UIs reativas que dependem disso (`useAutoDetect`
 * setando `detecting=true`) ficam presas.
 *
 * Limitação: `chrome.scripting.executeScript` não aceita AbortController
 * nativamente. Quando o timeout dispara, retornamos `null` mas o script
 * pode continuar rodando na aba até terminar. Aceitável: o resultado
 * tardio é descartado, sem efeito colateral.
 */

export class ScriptTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`chrome.scripting.executeScript timed out after ${timeoutMs}ms`);
    this.name = 'ScriptTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function executeScriptWithTimeout<R>(
  args: chrome.scripting.ScriptInjection<unknown[], R>,
  timeoutMs = 10_000,
): Promise<chrome.scripting.InjectionResult<R>[]> {
  return Promise.race([
    chrome.scripting.executeScript(args),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new ScriptTimeoutError(timeoutMs)), timeoutMs);
    }),
  ]);
}
