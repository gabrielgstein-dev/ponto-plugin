import type { IAuthProvider } from '../../domain/interfaces';

export class SeniorInterceptorAuth implements IAuthProvider {
  readonly name = 'interceptor';

  async getAccessToken(): Promise<string | null> {
    const stored = await chrome.storage.local.get(['seniorBearerToken', 'seniorBearerTs']);
    if (!stored.seniorBearerToken) return null;

    const ageMin = (Date.now() - (stored.seniorBearerTs || 0)) / 60000;
    if (ageMin >= 60) return null;

    return stored.seniorBearerToken;
  }
}
