import { SENIOR_API_BASE, SENIOR_TOKEN_MAX_AGE_MS } from './constants';
import { debugLog, debugWarn } from '../../domain/debug';

const REFRESH_ENDPOINT = `${SENIOR_API_BASE}/platform/authentication/actions/refreshToken`;
const STORAGE_KEYS = ['seniorToken', 'seniorTokenTs', 'seniorRefreshToken'] as const;

interface SeniorTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function persistSeniorTokens(tokens: SeniorTokenSet): Promise<void> {
  const save: Record<string, unknown> = {
    seniorToken: tokens.access_token,
    seniorTokenTs: Date.now(),
  };
  if (tokens.refresh_token) save.seniorRefreshToken = tokens.refresh_token;
  await chrome.storage.local.set(save);
  debugLog('Senior: tokens persistidos no storage');
}

export async function refreshSeniorTokenSilently(): Promise<string | null> {
  try {
    const stored = await chrome.storage.local.get(['seniorRefreshToken', 'seniorTokenTs']);
    const refreshToken = stored.seniorRefreshToken as string | undefined;
    if (!refreshToken) {
      debugLog('Senior refresh: sem refresh_token no storage');
      return null;
    }

    // Só tenta refresh se o token estiver próximo de expirar (< 12h restantes)
    const tokenTs = (stored.seniorTokenTs as number) || 0;
    const age = Date.now() - tokenTs;
    const remaining = SENIOR_TOKEN_MAX_AGE_MS - age;
    if (remaining > 12 * 60 * 60 * 1000) {
      debugLog(`Senior refresh: token ainda válido por ${Math.round(remaining / 3600000)}h, pulando refresh`);
      return null;
    }

    debugLog('Senior refresh: tentando renovar via refresh_token...');
    const r = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: refreshToken }),
    });

    if (!r.ok) {
      debugWarn('Senior refresh: endpoint retornou', r.status);
      return null;
    }

    const json = await r.json();
    const newToken = json.access_token;
    if (!newToken) {
      debugWarn('Senior refresh: resposta sem access_token', JSON.stringify(json).substring(0, 100));
      return null;
    }

    await persistSeniorTokens({ access_token: newToken, refresh_token: json.refresh_token });
    debugLog('Senior refresh: token renovado com sucesso');
    return newToken;
  } catch (e) {
    debugWarn('Senior refresh erro:', (e as Error).message);
    return null;
  }
}
