import type { IAuthProvider } from '../../domain/interfaces';

export class SeniorCookieAuth implements IAuthProvider {
  readonly name = 'cookie';

  async getAccessToken(): Promise<string | null> {
    try {
      const cookies = await chrome.cookies.getAll({ domain: '.senior.com.br', name: 'com.senior.token' });
      if (!cookies.length) return null;

      const decoded = decodeURIComponent(cookies[0].value);
      const obj = JSON.parse(decoded);

      if (obj.access_token) return obj.access_token;

      if (obj.jsonToken) {
        const jt = typeof obj.jsonToken === 'string' ? JSON.parse(obj.jsonToken) : obj.jsonToken;
        if (jt.access_token) return jt.access_token;
      }

      for (const val of Object.values(obj)) {
        if (typeof val === 'object' && val !== null && (val as Record<string, unknown>).access_token) {
          return (val as Record<string, string>).access_token;
        }
      }
    } catch (e) {
      console.warn('[Senior Ponto] Cookie auth erro:', (e as Error).message);
    }
    return null;
  }
}
