/**
 * POC: fetch direto do service worker contra `api.meta.com.br`, sem aba.
 *
 * Hipótese validada: o `host_permissions` `*://api.meta.com.br/*` no manifest
 * dá ao service worker fetch privilegiado SEM checagem CORS. O browser
 * trata a extensão como contexto same-origin pra hosts listados — diferente
 * de páginas web, que sempre passam por CORS.
 *
 * **Não usamos `declarativeNetRequest` pra remover Origin**: a doc MDN
 * confirma que o browser re-injeta Origin automaticamente em requests
 * CORS — DNR não consegue removê-lo. Esse caminho era falso.
 *
 * Resultado esperado:
 *   - 200 + JSON: caminho oficial confirmado, podemos eliminar abas.
 *   - 401: token expirado ou inválido — refresh silencioso resolve.
 *   - 403: API rejeita extension origin (improvável dado host_permissions).
 *   - TypeError "Failed to fetch" / CORS: host_permissions não está ativo
 *     ou foi alterado sem reload da extensão.
 *
 * Fontes:
 *   - https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
 *   - https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS (Origin não removível)
 */
import { debugLog } from '../../../domain/debug';
import { decodeJwtPayload } from '../../../domain/jwt-utils';

export interface TokenInfo {
  isJwt: boolean;
  expiresInSec: number | null;
  ageMs: number | null;
}

export interface DirectFetchResult {
  ok: boolean;
  status: number;
  bodyPreview: string;
  bodyLength: number;
  contentType: string;
  responseHeaders: Record<string, string>;
  errorMessage?: string;
  tokenInfo: TokenInfo;
}

function inspectToken(token: string, ageMs: number | null): TokenInfo {
  const payload = decodeJwtPayload(token);
  const expiresInSec = payload?.exp
    ? Math.round(payload.exp - Date.now() / 1000)
    : null;
  return {
    isJwt: payload !== null,
    expiresInSec,
    ageMs,
  };
}

export async function directFetchMetaTs(
  url: string,
  token: string,
  tokenAgeMs: number | null,
): Promise<DirectFetchResult> {
  const tokenInfo = inspectToken(token, tokenAgeMs);
  debugLog('[POC] directFetch pre-flight', JSON.stringify({ url, tokenInfo }));

  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    const text = await r.text();
    const preview = text.length > 400 ? text.slice(0, 400) + '…' : text;
    const responseHeaders: Record<string, string> = {};
    r.headers.forEach((v, k) => { responseHeaders[k] = v; });

    return {
      ok: r.ok,
      status: r.status,
      bodyPreview: preview,
      bodyLength: text.length,
      contentType: r.headers.get('content-type') ?? '',
      responseHeaders,
      tokenInfo,
    };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      status: 0,
      bodyPreview: '',
      bodyLength: 0,
      contentType: '',
      responseHeaders: {},
      errorMessage: `${err.name}: ${err.message}`,
      tokenInfo,
    };
  }
}
