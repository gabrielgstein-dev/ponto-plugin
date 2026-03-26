import type { IAuthProvider } from '../../domain/interfaces';
import { debugLog, debugWarn } from '../../domain/debug';

export class SeniorCookieAuth implements IAuthProvider {
  readonly name = 'cookie';

  async getAccessToken(): Promise<string | null> {
    try {
      debugLog('SeniorCookieAuth: buscando cookie com.senior.token...');
      const cookies = await chrome.cookies.getAll({ domain: '.senior.com.br', name: 'com.senior.token' });
      if (!cookies.length) {
        debugLog('SeniorCookieAuth: cookie não encontrado');
        return null;
      }

      debugLog('SeniorCookieAuth: cookie encontrado, fazendo parse...');
      const decoded = decodeURIComponent(cookies[0].value);
      const obj = JSON.parse(decoded);
      debugLog('SeniorCookieAuth: cookie keys:', Object.keys(obj).join(', '));

      if (obj.access_token) {
        debugLog('SeniorCookieAuth: access_token encontrado diretamente');
        return obj.access_token;
      }

      if (obj.jsonToken) {
        debugLog('SeniorCookieAuth: tentando jsonToken...');
        const jt = typeof obj.jsonToken === 'string' ? JSON.parse(obj.jsonToken) : obj.jsonToken;
        if (jt.access_token) {
          debugLog('SeniorCookieAuth: access_token encontrado em jsonToken');
          return jt.access_token;
        }
      }

      debugLog('SeniorCookieAuth: iterando valores do cookie...');
      for (const val of Object.values(obj)) {
        if (typeof val === 'object' && val !== null && (val as Record<string, unknown>).access_token) {
          debugLog('SeniorCookieAuth: access_token encontrado em valor nested');
          return (val as Record<string, string>).access_token;
        }
      }
      debugLog('SeniorCookieAuth: access_token não encontrado em nenhuma estrutura');
    } catch (e) {
      debugWarn('Cookie auth erro:', (e as Error).message);
    }
    return null;
  }
}
