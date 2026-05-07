import type { IAuthProvider } from '../../domain/interfaces';
import { persistSeniorTokens } from './senior-token-refresh';
import { debugLog } from '../../domain/debug';
import { logError } from '../../domain/error-logger';

export class SeniorCookieAuth implements IAuthProvider {
  readonly name = 'cookie';

  async getAccessToken(): Promise<string | null> {
    try {
      debugLog('SeniorCookieAuth: buscando cookie com.senior.token...');
      const cookies = await chrome.cookies.getAll({ domain: '.senior.com.br', name: 'com.senior.token' });
      if (!cookies.length) {
        // DIAG: investigando hipótese de cookies Partitioned (CHIPS).
        // Senior X serve em frames (?category=frame), Chrome 118+ particiona
        // cookies third-party por embedder. Sem partitionKey, getAll não vê.
        await this.diagnoseCookieAccess();
        debugLog('SeniorCookieAuth: cookie não encontrado');
        return null;
      }

      debugLog('SeniorCookieAuth: cookie encontrado, fazendo parse...');
      const decoded = decodeURIComponent(cookies[0].value);
      const obj = JSON.parse(decoded);
      debugLog('SeniorCookieAuth: cookie keys:', Object.keys(obj).join(', '));

      const token = this.extractToken(obj);
      if (token) {
        // Persiste no storage para sobreviver ao browser fechar (cookie pode ser de sessão)
        persistSeniorTokens({ access_token: token, refresh_token: obj.refresh_token as string | undefined }).catch((e) => {
          logError(e, {
            category: 'storage',
            severity: 'low',
            operation: 'SeniorCookieAuth.persistTokens',
          });
        });
        return token;
      }
      debugLog('SeniorCookieAuth: access_token não encontrado em nenhuma estrutura');
    } catch (e) {
      logError(e, {
        category: 'auth',
        severity: 'medium',
        operation: 'SeniorCookieAuth.getAccessToken',
      });
    }
    return null;
  }

  // DIAG (temporário): tenta diferentes filtros de getAll pra ver qual
  // forma encontra o cookie. Resultado vai pro log e ajuda a confirmar
  // se é cookies Partitioned (CHIPS) ou outra causa.
  private async diagnoseCookieAccess(): Promise<void> {
    const attempts: Array<{ label: string; details: chrome.cookies.GetAllDetails }> = [
      { label: 'name only', details: { name: 'com.senior.token' } },
      { label: 'domain platform.senior', details: { domain: 'platform.senior.com.br', name: 'com.senior.token' } },
      { label: 'url platform.senior', details: { url: 'https://platform.senior.com.br/', name: 'com.senior.token' } },
      { label: 'partitionKey platform.senior', details: {
        url: 'https://platform.senior.com.br/',
        name: 'com.senior.token',
        partitionKey: { topLevelSite: 'https://platform.senior.com.br' },
      } as chrome.cookies.GetAllDetails },
    ];
    const results: Array<Record<string, unknown>> = [];
    for (const { label, details } of attempts) {
      try {
        const found = await chrome.cookies.getAll(details);
        results.push({
          label,
          count: found.length,
          partitionKeys: found.map(c => (c as { partitionKey?: unknown }).partitionKey ?? null),
          domains: found.map(c => c.domain),
        });
      } catch (e) {
        results.push({ label, error: (e as Error).message });
      }
    }
    debugLog('[diag] SeniorCookieAuth getAll attempts:', JSON.stringify(results));
  }

  private extractToken(obj: Record<string, unknown>): string | null {
    if (obj.access_token) {
      debugLog('SeniorCookieAuth: access_token encontrado diretamente');
      return obj.access_token as string;
    }
    if (obj.jsonToken) {
      debugLog('SeniorCookieAuth: tentando jsonToken...');
      const jt = typeof obj.jsonToken === 'string' ? JSON.parse(obj.jsonToken as string) : obj.jsonToken as Record<string, unknown>;
      if (jt.access_token) {
        debugLog('SeniorCookieAuth: access_token encontrado em jsonToken');
        return jt.access_token as string;
      }
    }
    debugLog('SeniorCookieAuth: iterando valores do cookie...');
    for (const val of Object.values(obj)) {
      if (typeof val === 'object' && val !== null && (val as Record<string, unknown>).access_token) {
        debugLog('SeniorCookieAuth: access_token encontrado em valor nested');
        return (val as Record<string, string>).access_token;
      }
    }
    return null;
  }
}
