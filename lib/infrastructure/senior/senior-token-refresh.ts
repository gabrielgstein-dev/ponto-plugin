import { SENIOR_API_BASE } from './constants';
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

/**
 * Renova o access_token do Senior via endpoint proprietário /refreshToken.
 *
 * Contrato real validado em produção (POC):
 *   POST .../platform/authentication/actions/refreshToken
 *   Body:  { "refreshToken": "<opaque>" }   ← parâmetro é "refreshToken", não "token"
 *   200:   { "jsonToken": "<string JSON escapada>" }
 *          jsonToken contém { access_token, refresh_token, expires_in, ... }
 *
 * O refresh_token é rotacionado a cada chamada — sempre persistir o novo.
 */
export async function refreshSeniorTokenSilently(_opts: { force?: boolean } = {}): Promise<string | null> {
  try {
    const stored = await chrome.storage.local.get(['seniorRefreshToken']);
    const refreshToken = stored.seniorRefreshToken as string | undefined;
    if (!refreshToken) {
      debugLog('Senior refresh: sem refresh_token no storage');
      return null;
    }

    debugLog('Senior refresh: tentando renovar via refresh_token...');
    const r = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      debugWarn('Senior refresh: endpoint retornou', r.status, body.substring(0, 200));
      return null;
    }

    const json = await r.json();
    const inner = parseJsonToken(json);
    if (!inner?.access_token) {
      debugWarn('Senior refresh: resposta sem access_token', JSON.stringify(json).substring(0, 200));
      return null;
    }

    await persistSeniorTokens({
      access_token: inner.access_token,
      refresh_token: inner.refresh_token,
      expires_in: inner.expires_in,
    });
    debugLog('Senior refresh: token renovado com sucesso');
    return inner.access_token;
  } catch (e) {
    debugWarn('Senior refresh erro:', (e as Error).message);
    return null;
  }
}

interface JsonTokenInner {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

function parseJsonToken(json: unknown): JsonTokenInner | null {
  if (!json || typeof json !== 'object') return null;
  const wrap = json as { jsonToken?: unknown };
  if (typeof wrap.jsonToken === 'string') {
    try { return JSON.parse(wrap.jsonToken) as JsonTokenInner; } catch { return null; }
  }
  if (typeof wrap.jsonToken === 'object' && wrap.jsonToken !== null) {
    return wrap.jsonToken as JsonTokenInner;
  }
  return null;
}
