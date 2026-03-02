import { GP_FRONTEND_URL } from './constants';

export async function findSeniorTab(): Promise<chrome.tabs.Tab | null> {
  const allTabs = await chrome.tabs.query({});
  return allTabs.find(t => t.url?.includes('senior.com.br')) ?? null;
}

export async function findGpTab(): Promise<chrome.tabs.Tab | null> {
  const allTabs = await chrome.tabs.query({});
  return allTabs.find(t => t.url?.includes('gestaoponto')) ?? null;
}

export async function getOrCreateGpTab(allowCreate: boolean): Promise<{ tab: chrome.tabs.Tab; created: boolean } | null> {
  const existing = await findGpTab();
  if (existing) return { tab: existing, created: false };
  if (!allowCreate) return null;

  try {
    const tab = await chrome.tabs.create({ url: GP_FRONTEND_URL, active: false });
    return { tab, created: true };
  } catch (e) {
    console.warn('[Senior Ponto] Falha ao criar aba GP:', (e as Error).message);
    return null;
  }
}

export function safeCloseTab(tabId: number): void {
  try { chrome.tabs.remove(tabId); } catch (_) {}
}
