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
import { waitForNavigation } from '../../../domain/web-nav-utils';

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

async function isTabOnPlatform(tabId: number, platformUrl: string, expectedPath?: string): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const origin = new URL(platformUrl).origin;
    if (!tab.url?.startsWith(origin)) return false;
    // Quando temos um path esperado (ex.: /modules/timesheet/create), validamos
    // pra não reusar abas paradas em /login (frame instável → executeScript falha).
    if (expectedPath && !tab.url.includes(expectedPath)) return false;
    return true;
  } catch {
    return false;
  }
}

async function getOrCreateTab(
  config: TimesheetConfig,
): Promise<CachedTab | null> {
  const expected = config.expectedPathContains ?? new URL(config.platformUrl).pathname;

  // 1. Cache hit: usa a aba que abrimos antes (se ainda existe e está no domínio certo).
  if (cachedTab) {
    if (await isTabOnPlatform(cachedTab.tabId, config.platformUrl, expected)) {
      return cachedTab;
    }
    cachedTab = null;
  }

  // 2. Existing tab: o usuário pode já estar com plataforma.meta.com.br aberta.
  const existing = await findPlatformTab(config.platformUrl);
  if (existing?.id != null) {
    // Aba do usuário pode estar em rota qualquer da plataforma. Se já está
    // na rota esperada, reusa; senão aguarda navegação até lá (sem
    // intervenção, alguns SPAs recolocam ?callbackUrl no histórico).
    if (existing.url?.includes(expected)) {
      cachedTab = { tabId: existing.id, ownership: 'reused' };
      return cachedTab;
    }
    const landed = await waitForNavigation(existing.id, { urlContains: expected, timeoutMs: 5_000 });
    if (landed) {
      cachedTab = { tabId: existing.id, ownership: 'reused' };
      return cachedTab;
    }
    // Aba existente não navegou pra rota esperada — segue pra criar nova
    // (background fica responsável; sidepanel pede via mensagem).
  }

  // 3. Cria uma nova aba inativa. bootstrapUrl deve dispar SSO + landing
  //    na rota esperada (ex.: /modules/timesheet/create).
  const startUrl = config.bootstrapUrl ?? config.platformUrl;
  try {
    const tab = await chrome.tabs.create({ url: startUrl, active: false });
    if (tab.id == null) return null;
    debugLog(`${config.name} fetchViaTab: aba criada (id=${tab.id}, url=${startUrl})`);

    // webNavigation.onCompleted é a forma confiável de saber que a SPA
    // terminou o redirect chain do SSO. Aguarda URL conter a rota
    // esperada — só então o frame está estável pra executeScript.
    const landed = await waitForNavigation(tab.id, {
      urlContains: expected,
      timeoutMs: 30_000,
    });
    if (!landed) {
      const finalTab = await chrome.tabs.get(tab.id).catch(() => null);
      debugWarn(
        `${config.name} fetchViaTab: navegação não chegou em ${expected}`,
        'url=' + (finalTab?.url ?? 'unknown'),
      );
      try { await chrome.tabs.remove(tab.id); } catch (_) { /* ignore */ }
      return null;
    }

    // Pausa curta pro service worker / interceptors da SPA registrarem
    // antes do primeiro fetch autenticado.
    await new Promise(resolve => setTimeout(resolve, POST_COMPLETE_DELAY_MS));

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
          // Sem credentials: 'include' — api.meta.com.br usa token Bearer;
          // 'include' exigiria Access-Control-Allow-Credentials:true no CORS
          // preflight, que o servidor não retorna (SPA usa withCredentials:false).
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
    let tabUrl = 'unknown';
    try {
      const tabInfo = await chrome.tabs.get(tab.tabId);
      tabUrl = tabInfo?.url ?? 'unknown';
    } catch (_) { /* apenas para log */ }
    debugLog(`${config.name} fetchViaTab: executando fetch tabId=${tab.tabId} tabUrl=${tabUrl}`);
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
