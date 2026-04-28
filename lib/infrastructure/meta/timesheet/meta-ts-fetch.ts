/**
 * Executa fetches contra `api.meta.com.br` a partir de uma aba aberta em
 * `plataforma.meta.com.br`. Necessário porque a API responde
 * `Access-Control-Allow-Origin: https://plataforma.meta.com.br`,
 * o que bloqueia chamadas feitas direto do origin `chrome-extension://...`.
 *
 * Estratégia: localizar (ou abrir) uma aba na plataforma, injetar um script
 * em `world: 'MAIN'` que faz o fetch dentro do contexto da página, e
 * devolver o resultado serializável (status + corpo em texto).
 *
 * A aba criada é cacheada em escopo de módulo e fechada após
 * `TAB_IDLE_CLOSE_MS` de inatividade — um único `getSummary` que faz 3
 * fetches usa a mesma aba em vez de criar/fechar 3 vezes.
 */
import type { TimesheetConfig } from '../../timesheet/timesheet-config';
import { debugLog, debugWarn } from '../../../domain/debug';

export interface TabFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface TabFetchResponse {
  ok: boolean;
  status: number;
  text: string;
}

const TAB_IDLE_CLOSE_MS = 30_000;
// Tempo extra após `status: 'complete'` para SPA / service worker da
// plataforma se inicializarem antes do primeiro fetch.
const POST_COMPLETE_DELAY_MS = 2_000;

interface CachedTab {
  tabId: number;
  ownership: 'created' | 'reused';
}

let cachedTab: CachedTab | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleClose(): void {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = null;
    const cache = cachedTab;
    cachedTab = null;
    if (cache?.ownership === 'created') {
      try {
        const res = chrome.tabs.remove(cache.tabId) as unknown as { catch?: (fn: (e: unknown) => void) => void } | void;
        res?.catch?.(() => { /* ignore */ });
      } catch (_) { /* ignore */ }
    }
  }, TAB_IDLE_CLOSE_MS);
}

/* v8 ignore next 8 -- helper apenas para testes; não roda em produção */
export function _resetCacheForTests(): void {
  cachedTab = null;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

async function findPlatformTab(platformUrl: string): Promise<chrome.tabs.Tab | null> {
  const origin = new URL(platformUrl).origin;
  const tabs = await chrome.tabs.query({});
  return tabs.find(t => t.url?.startsWith(origin)) ?? null;
}

async function waitForTabComplete(tabId: number, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return true;
    } catch (_) {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

async function isTabOnPlatform(tabId: number, platformUrl: string): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const origin = new URL(platformUrl).origin;
    return tab.url?.startsWith(origin) ?? false;
  } catch {
    return false;
  }
}

/**
 * Acompanha o redirect chain do SSO (ex.: Senior login → senior-x →
 * plataforma) e resolve quando a aba chega no origin alvo com a página
 * carregada. Espera no máximo `timeoutMs` no total.
 */
async function waitForRedirectToOrigin(
  tabId: number,
  platformUrl: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  const origin = new URL(platformUrl).origin;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url?.startsWith(origin) && tab.status === 'complete') return true;
    } catch (_) {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function getOrCreateTab(
  config: TimesheetConfig,
): Promise<CachedTab | null> {
  // 1. Cache hit: usa a aba que abrimos antes (se ainda existe e está no domínio certo).
  if (cachedTab) {
    if (await isTabOnPlatform(cachedTab.tabId, config.platformUrl)) {
      return cachedTab;
    }
    cachedTab = null;
  }

  // 2. Existing tab: o usuário pode já estar com plataforma.meta.com.br aberta.
  const existing = await findPlatformTab(config.platformUrl);
  if (existing?.id != null) {
    cachedTab = { tabId: existing.id, ownership: 'reused' };
    return cachedTab;
  }

  // 3. Cria uma nova aba inativa. Se houver bootstrapUrl, abrimos por ela
  //    pra disparar o SSO completo; o redirect chain deve terminar em
  //    `platformUrl` (que é o origin que a API aceita).
  const startUrl = config.bootstrapUrl ?? config.platformUrl;
  try {
    const tab = await chrome.tabs.create({ url: startUrl, active: false });
    if (tab.id == null) return null;
    debugLog(`${config.name} fetchViaTab: aba criada (id=${tab.id}, url=${startUrl})`);

    const ready = await waitForTabComplete(tab.id);
    if (!ready) {
      debugWarn(`${config.name} fetchViaTab: aba não ficou pronta`);
      try { await chrome.tabs.remove(tab.id); } catch (_) { /* ignore */ }
      return null;
    }

    // Quando passamos por bootstrapUrl, esperamos o redirect chain terminar
    // no origin alvo. Caso contrário, basta uma pausa pro SPA bootstrap.
    if (config.bootstrapUrl) {
      const landed = await waitForRedirectToOrigin(tab.id, config.platformUrl);
      if (!landed) {
        const finalTab = await chrome.tabs.get(tab.id).catch(() => null);
        debugWarn(
          `${config.name} fetchViaTab: SSO não terminou em ${new URL(config.platformUrl).origin}`,
          'url=' + (finalTab?.url ?? 'unknown'),
        );
        try { await chrome.tabs.remove(tab.id); } catch (_) { /* ignore */ }
        return null;
      }
    }

    // Pausa extra pro SPA / service worker da plataforma se registrar
    // antes do primeiro fetch autenticado.
    await new Promise(resolve => setTimeout(resolve, POST_COMPLETE_DELAY_MS));

    if (!(await isTabOnPlatform(tab.id, config.platformUrl))) {
      const finalTab = await chrome.tabs.get(tab.id).catch(() => null);
      debugWarn(
        `${config.name} fetchViaTab: aba não está no origin esperado`,
        'url=' + (finalTab?.url ?? 'unknown'),
      );
      try { await chrome.tabs.remove(tab.id); } catch (_) { /* ignore */ }
      return null;
    }

    cachedTab = { tabId: tab.id, ownership: 'created' };
    return cachedTab;
  } catch (e) {
    debugWarn(`${config.name} fetchViaTab: falha ao criar aba:`, (e as Error).message);
    return null;
  }
}

async function executeFetch(
  tabId: number,
  url: string,
  init: TabFetchInit,
): Promise<TabFetchResponse | null> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [url, init],
    func: async (u: string, i: TabFetchInit): Promise<TabFetchResponse> => {
      try {
        const r = await fetch(u, {
          method: i.method ?? 'GET',
          headers: i.headers,
          body: i.body,
          credentials: 'include',
        });
        const text = await r.text();
        return { ok: r.ok, status: r.status, text };
      } catch (e) {
        return { ok: false, status: 0, text: 'fetch_error: ' + (e as Error).message };
      }
    },
  });
  return results?.[0]?.result ?? null;
}

export async function fetchViaMetaTab(
  config: TimesheetConfig,
  url: string,
  init: TabFetchInit = {},
): Promise<TabFetchResponse | null> {
  const tab = await getOrCreateTab(config);
  if (!tab) return null;

  try {
    const response = await executeFetch(tab.tabId, url, init);
    scheduleIdleClose();
    if (response && (!response.ok || response.status === 0)) {
      // Loga o início do corpo da resposta pra ajudar diagnóstico
      // (CORS/preflight devolvem texto vazio, fetch_error vem com a mensagem).
      const preview = response.text.length > 200
        ? response.text.slice(0, 200) + '…'
        : response.text;
      debugWarn(
        `${config.name} fetchViaTab: resposta não-OK`,
        'status=' + response.status,
        'tabId=' + tab.tabId,
        'body=' + preview,
      );
    }
    return response;
  } catch (e) {
    debugWarn(`${config.name} fetchViaTab erro:`, (e as Error).message);
    return null;
  }
}
