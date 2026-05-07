/**
 * `chrome.webNavigation.onCompleted` é a forma confiável de saber que uma
 * navegação realmente terminou — incluindo cadeias de redirect SSO em SPAs.
 *
 * Diferente de `chrome.tabs.get(...).status === 'complete'` (que dispara
 * cedo demais quando há `/login` → SSO → app), `onCompleted` só dispara
 * depois que o navegador terminou de processar o documento final.
 *
 * Combinado com `onHistoryStateUpdated`, cobre também SPAs que mudam URL
 * via pushState/replaceState pós-load (caso comum em NextAuth).
 *
 * Quando `executeScript` é chamado durante um redirect, o frame antigo já
 * foi destruído mas o novo ainda não foi commit — daí o erro
 * "Frame with ID 0 was removed". Aguardar este helper antes resolve.
 */

interface WaitOptions {
  /** Substring esperada no PATHNAME final (ex.: '/modules/timesheet/create').
   *  Match é feito contra `new URL(url).pathname`, não contra a URL inteira —
   *  evita falso-positivo em `/login?callbackUrl=/modules/timesheet/create`. */
  urlContains: string;
  /** Tempo máximo aguardando (ms). Default 30s. */
  timeoutMs?: number;
}

function pathnameOf(url: string): string {
  try { return new URL(url).pathname; } catch { return ''; }
}

/**
 * Aguarda a aba terminar de navegar até uma URL cujo pathname contenha
 * `urlContains`. Resolve com a URL final ou `null` em timeout / aba removida.
 */
export function waitForNavigation(
  tabId: number,
  opts: WaitOptions,
): Promise<string | null> {
  const { urlContains, timeoutMs = 30_000 } = opts;
  const matches = (url: string | undefined) =>
    !!url && pathnameOf(url).includes(urlContains);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const onCompleted = (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
      if (details.tabId !== tabId) return;
      if (details.frameId !== 0) return; // só top frame
      if (matches(details.url)) settle(details.url);
    };

    const onHistory = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
      if (details.tabId !== tabId) return;
      if (details.frameId !== 0) return;
      if (matches(details.url)) settle(details.url);
    };

    const onRemoved = (removedTabId: number) => {
      if (removedTabId === tabId) settle(null);
    };

    const cleanup = () => {
      try { chrome.webNavigation.onCompleted.removeListener(onCompleted); } catch { /* */ }
      try { chrome.webNavigation.onHistoryStateUpdated.removeListener(onHistory); } catch { /* */ }
      try { chrome.tabs.onRemoved.removeListener(onRemoved); } catch { /* */ }
      clearTimeout(timer);
    };

    chrome.webNavigation.onCompleted.addListener(onCompleted);
    chrome.webNavigation.onHistoryStateUpdated.addListener(onHistory);
    chrome.tabs.onRemoved.addListener(onRemoved);

    const timer = setTimeout(() => settle(null), timeoutMs);

    // Fast path: aba já está na URL esperada.
    chrome.tabs.get(tabId).then(tab => {
      if (settled) return;
      if (tab.status === 'complete' && matches(tab.url)) {
        settle(tab.url ?? null);
      }
    }).catch(() => settle(null));
  });
}
