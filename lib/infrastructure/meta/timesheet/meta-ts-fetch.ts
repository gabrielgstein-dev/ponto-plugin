/**
 * Executa fetches contra `api.meta.com.br` a partir de uma aba aberta em
 * `plataforma.meta.com.br`. Necessário porque a API responde
 * `Access-Control-Allow-Origin: https://plataforma.meta.com.br`,
 * o que bloqueia chamadas feitas direto do origin `chrome-extension://...`.
 *
 * Estratégia: localizar (ou abrir) uma aba na plataforma, injetar um script
 * em `world: 'MAIN'` que faz o fetch dentro do contexto da página, e
 * devolver o resultado serializável (status + corpo em texto).
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

async function ensurePlatformTab(
  config: TimesheetConfig,
): Promise<{ tabId: number; created: boolean } | null> {
  const existing = await findPlatformTab(config.platformUrl);
  if (existing?.id != null) {
    return { tabId: existing.id, created: false };
  }
  try {
    const tab = await chrome.tabs.create({ url: config.platformUrl, active: false });
    if (tab.id == null) return null;
    debugLog(`${config.name} fetchViaTab: aba criada (id=${tab.id})`);
    const ready = await waitForTabComplete(tab.id);
    if (!ready) {
      debugWarn(`${config.name} fetchViaTab: aba não ficou pronta`);
      try { await chrome.tabs.remove(tab.id); } catch (_) { /* ignore */ }
      return null;
    }
    return { tabId: tab.id, created: true };
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
  const tabInfo = await ensurePlatformTab(config);
  if (!tabInfo) return null;

  try {
    return await executeFetch(tabInfo.tabId, url, init);
  } catch (e) {
    debugWarn(`${config.name} fetchViaTab erro:`, (e as Error).message);
    return null;
  } finally {
    if (tabInfo.created) {
      try { await chrome.tabs.remove(tabInfo.tabId); } catch (_) { /* ignore */ }
    }
  }
}
