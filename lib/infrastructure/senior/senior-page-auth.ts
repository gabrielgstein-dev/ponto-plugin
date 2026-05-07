import type { IAuthProvider } from '../../domain/interfaces';
import { findSeniorTab } from './tab-utils';
import { logError } from '../../domain/error-logger';
import { executeScriptWithTimeout } from '../../domain/script-utils';

export class SeniorPageAuth implements IAuthProvider {
  readonly name = 'pageContext';

  async getAccessToken(): Promise<string | null> {
    const tab = await findSeniorTab();
    if (!tab) return null;

    try {
      const results = await executeScriptWithTimeout<Record<string, string>>({
        target: { tabId: tab.id! },
        world: 'MAIN',
        func: () => {
          // Senior X armazena token HCM em `<token>-<APP>` no sessionStorage,
          // com JSON `{expires,payload:{token}}` (179 chars típicos).
          // 2000 chars cobre o caso e mantém ceiling pra entradas grandes
          // (ex.: cache-menu de 16k que não tem token).
          const MAX_CHARS = 2000;
          const dump: Record<string, string> = {};
          try {
            for (let i = 0; i < sessionStorage.length; i++) {
              const k = sessionStorage.key(i)!;
              dump['SS:' + k] = (sessionStorage.getItem(k) || '').substring(0, MAX_CHARS);
            }
          } catch (_) {}
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i)!;
              dump['LS:' + k] = (localStorage.getItem(k) || '').substring(0, MAX_CHARS);
            }
          } catch (_) {}
          return dump;
        },
      });

      return this.extractToken(results?.[0]?.result);
    } catch (e) {
      logError(e, {
        category: 'auth',
        severity: 'medium',
        operation: 'SeniorPageAuth.getAccessToken',
        metadata: {
          tabId: tab.id,
          isTimeout: (e as { name?: string })?.name === 'ScriptTimeoutError',
        },
      });
    }
    return null;
  }

  private extractToken(data: Record<string, string> | undefined): string | null {
    if (!data) return null;
    const todayIso = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Senior X arquiva tokens por aplicação no sessionStorage com chaves
    // `<token>-<APP>` (ex.: `ar1nlKcp...-HCM`) e valor JSON
    // `{expires:"YYYY-MM-DD", payload:{token, frontendURL, backendURL}}`.
    // O endpoint `/gestaoponto-backend/api/senior/auth/g7` aceita só tokens
    // de escopo HCM (confirmado em log: tokens `/platform/*` retornam 502).
    // Por isso priorizamos chaves terminando em `-HCM` na busca.
    const entries = Object.entries(data).sort(([a], [b]) => {
      const aHcm = /-HCM$/.test(a) ? 1 : 0;
      const bHcm = /-HCM$/.test(b) ? 1 : 0;
      return bHcm - aHcm;
    });

    for (const [, val] of entries) {
      if (!val) continue;
      try {
        const obj = JSON.parse(val);
        // Formato Senior X: { expires, payload: { token } }
        const tokenFromPayload = obj?.payload?.token;
        if (typeof tokenFromPayload === 'string' && tokenFromPayload.length >= 20) {
          // Valida `expires` (formato YYYY-MM-DD) — pula entradas vencidas.
          const expires = obj?.expires;
          if (typeof expires === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expires) && expires < todayIso) {
            continue;
          }
          return tokenFromPayload;
        }
        // Formato OAuth padrão (mantido por compatibilidade)
        if (obj?.access_token) return obj.access_token;
      } catch (_) {}
      // Fallback: JWT cru no valor (não é o caso do Senior X opaque, mas
      // alguns SPAs salvam JWT direto como string)
      if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(val)) return val;
    }
    return null;
  }
}
