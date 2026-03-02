import type { IAuthProvider } from '../../domain/interfaces';
import { findSeniorTab } from './tab-utils';

export class SeniorPageAuth implements IAuthProvider {
  readonly name = 'pageContext';

  async getAccessToken(): Promise<string | null> {
    const tab = await findSeniorTab();
    if (!tab) return null;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        world: 'MAIN',
        func: () => {
          const dump: Record<string, string> = {};
          try {
            for (let i = 0; i < sessionStorage.length; i++) {
              const k = sessionStorage.key(i)!;
              dump['SS:' + k] = (sessionStorage.getItem(k) || '').substring(0, 300);
            }
          } catch (_) {}
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i)!;
              dump['LS:' + k] = (localStorage.getItem(k) || '').substring(0, 300);
            }
          } catch (_) {}
          return dump;
        },
      });

      return this.extractToken(results?.[0]?.result);
    } catch (e) {
      console.warn('[Senior Ponto] Page auth erro:', (e as Error).message);
    }
    return null;
  }

  private extractToken(data: Record<string, string> | undefined): string | null {
    if (!data) return null;
    for (const val of Object.values(data)) {
      if (!val) continue;
      try {
        const obj = JSON.parse(val);
        if (obj?.access_token) return obj.access_token;
      } catch (_) {}
      if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(val)) return val;
    }
    return null;
  }
}
