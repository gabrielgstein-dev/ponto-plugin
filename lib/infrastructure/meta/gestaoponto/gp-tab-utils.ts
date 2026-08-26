import { GP_FRONTEND_URL, GP_LOCAL_LOGIN_PATH } from './constants';
import { debugWarn } from '../../../domain/debug';

export function isUsableGpTabUrl(url: string | undefined): boolean {
  if (!url || !url.includes('gestaoponto')) return false;
  // Aba parada no login local (usuário/senha) nunca vai ter SeniorGPOSession —
  // esperar sessão nela só queima os 15s/45s do waitForGpSession.
  try { return !new URL(url).pathname.startsWith(GP_LOCAL_LOGIN_PATH); } catch { return false; }
}

export async function findGpTab(): Promise<chrome.tabs.Tab | null> {
  const allTabs = await chrome.tabs.query({});
  return allTabs.find(t => isUsableGpTabUrl(t.url)) ?? null;
}

export async function getOrCreateGpTab(allowCreate: boolean): Promise<{ tab: chrome.tabs.Tab; created: boolean } | null> {
  const existing = await findGpTab();
  if (existing) return { tab: existing, created: false };
  if (!allowCreate) return null;

  try {
    const tab = await chrome.tabs.create({ url: GP_FRONTEND_URL, active: false });
    return { tab, created: true };
  } catch (e) {
    debugWarn('Falha ao criar aba GP:', (e as Error).message);
    return null;
  }
}

export function safeCloseTab(tabId: number): void {
  try { chrome.tabs.remove(tabId); } catch (_) {}
}
