/**
 * Renovação silenciosa do token Meta Timesheet via NextAuth.
 *
 * A plataforma Meta usa NextAuth.js com Keycloak (iamp.meta.com.br).
 * O JWT emitido dura 5min, mas /api/auth/session retorna um accessToken
 * fresco usando o cookie de sessão NextAuth — sem redirect SSO.
 *
 * Implementação: fetch direto do background com `credentials: 'include'`.
 *
 * PORÉM: desde ~Chrome 118 o service worker MV3 é tratado como iniciador
 * cross-site, então o cookie de sessão NextAuth (SameSite=Lax) NÃO acompanha
 * o fetch — o servidor responde `{}` sem accessToken (confirmado em prod
 * 2026-07-10 via netlog: a MESMA request na aba retorna o token). Como o
 * cookie de sessão é durável (dias), lemos ele via chrome.cookies e o
 * reinjetamos no fetch do SW via uma regra de sessão declarativeNetRequest
 * (escopo tabId=-1, só a request do background). Assim a renovação segue
 * headless, sem abrir aba, enquanto existir sessão no navegador.
 *
 * Proteções:
 *   - Timeout de 5s
 *   - Single-flight lock
 *   - Feature flag ENABLE_SILENT_REFRESH
 *   - JWT validation antes de persistir
 *   - Degrada para fetch sem injeção se cookies/DNR indisponíveis
 */
import type { TimesheetConfig } from '../../timesheet/timesheet-config';
import type { TimesheetAuth } from '../../timesheet/timesheet-auth';
import { ENABLE_SILENT_REFRESH } from '../../../domain/build-flags';
import { debugLog, errorLog } from '../../../domain/debug';
import { logError } from '../../../domain/error-logger';
import { fetchWithTimeout, summarizeResponse } from '../../../domain/fetch-utils';
import { isValidJWT } from '../../../domain/jwt-utils';

const REFRESH_TIMEOUT_MS = 5000;
// ID estável da regra de sessão DNR que injeta o cookie. Removida após cada uso.
const SESSION_COOKIE_RULE_ID = 8271;

let inflightRefresh: Promise<string | null> | null = null;

/**
 * Monta o header Cookie com todos os cookies que o navegador enviaria para
 * `platformUrl` (inclui HttpOnly — a extensão tem permissão `cookies`).
 * Retorna null quando a API não existe ou não há cookies (sessão ausente).
 */
async function buildPlatformCookieHeader(platformUrl: string): Promise<string | null> {
  try {
    const cookiesApi = (chrome as unknown as { cookies?: { getAll?: (q: { url: string }) => Promise<Array<{ name: string; value: string }>> } }).cookies;
    if (!cookiesApi?.getAll) return null;
    const cookies = await cookiesApi.getAll({ url: platformUrl });
    if (!Array.isArray(cookies) || cookies.length === 0) return null;
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch (_) {
    return null;
  }
}

/**
 * Executa `fn` com uma regra DNR temporária que seta o header Cookie na request
 * do background para `url`. Se DNR não existir/for negado, roda `fn` sem regra
 * (o fetch tenta com o que o navegador anexar sozinho). Sempre remove a regra.
 */
async function withInjectedSessionCookie<T>(url: string, cookieHeader: string, fn: () => Promise<T>): Promise<T> {
  const dnr = (chrome as unknown as { declarativeNetRequest?: { updateSessionRules?: (o: unknown) => Promise<void> } }).declarativeNetRequest;
  if (!dnr?.updateSessionRules) return fn();
  try {
    await dnr.updateSessionRules({
      removeRuleIds: [SESSION_COOKIE_RULE_ID],
      addRules: [{
        id: SESSION_COOKIE_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'cookie', operation: 'set', value: cookieHeader }],
        },
        // Âncoras | = casamento exato da URL. tabId=-1 = só a request do SW
        // (não mexe no /api/auth/session que a própria aba dispara).
        condition: { urlFilter: `|${url}|`, resourceTypes: ['xmlhttprequest', 'other'], tabIds: [-1] },
      }],
    });
  } catch (_) {
    return fn();
  }
  try {
    return await fn();
  } finally {
    try { await dnr.updateSessionRules({ removeRuleIds: [SESSION_COOKIE_RULE_ID] }); } catch (_) { /* ignore */ }
  }
}

export async function getMetaTsTokenSilently(
  config: TimesheetConfig,
  auth: TimesheetAuth,
): Promise<string | null> {
  if (!ENABLE_SILENT_REFRESH) {
    debugLog('meta-ts-session: ENABLE_SILENT_REFRESH=false, no-op');
    return null;
  }

  if (inflightRefresh) {
    debugLog('meta-ts-session: refresh já em curso, aguardando');
    return inflightRefresh;
  }

  inflightRefresh = doRefresh(config, auth).finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

async function doRefresh(config: TimesheetConfig, auth: TimesheetAuth): Promise<string | null> {
  const url = `${config.platformUrl}${config.sessionEndpoint}`;
  try {
    const doFetch = () => fetchWithTimeout(url, {
      credentials: 'include',
      timeoutMs: REFRESH_TIMEOUT_MS,
    });
    // Injeta o cookie de sessão da plataforma na request do SW (o Chrome não
    // envia o SameSite=Lax sozinho). Sem cookie/sessão → fetch normal.
    const cookieHeader = await buildPlatformCookieHeader(config.platformUrl);
    if (cookieHeader) debugLog('meta-ts-session: cookie de sessão anexado via DNR ao refresh');
    const r = cookieHeader
      ? await withInjectedSessionCookie(url, cookieHeader, doFetch)
      : await doFetch();
    if (!r.ok) {
      const summary = await summarizeResponse(r);
      logError(new Error(`session endpoint returned ${r.status}`), {
        category: 'auth',
        severity: r.status === 401 ? 'medium' : 'high',
        operation: 'meta-ts-session.refresh',
        metadata: { url, ...summary },
      });
      return null;
    }
    // Importante: lemos como text e depois fazemos parse — assim conseguimos
    // logar o body real quando a resposta vier sem accessToken.
    const rawBody = await r.text();
    let token: string | undefined;
    let sessionError: string | undefined;
    try {
      const parsed = JSON.parse(rawBody) as { accessToken?: string; error?: string };
      token = parsed?.accessToken;
      sessionError = parsed?.error;
    } catch (_) {
      /* parse falha cai no branch abaixo */
    }
    if (typeof token !== 'string' || !isValidJWT(token)) {
      // Distingue "sessão SSO morta" de "sem token". Quando o refresh token do
      // Keycloak expira (idle/max lifetime), a plataforma responde 200 com
      // `{accessToken: <JWT vencido>, error: 'RefreshAccessTokenError'}` — headless
      // não recupera, só login interativo. O JWT vencido tem exp no passado.
      const sessionExpired =
        sessionError === 'RefreshAccessTokenError' || (typeof token === 'string' && !isValidJWT(token));
      const preview = rawBody.length > 500 ? rawBody.slice(0, 500) + `…[+${rawBody.length - 500}]` : rawBody;
      errorLog(
        sessionExpired
          ? 'meta-ts-session: sessão da plataforma expirada (refresh token SSO morto) — requer novo login'
          : 'meta-ts-session: resposta sem accessToken válido',
        JSON.stringify({
          status: r.status,
          sessionError,
          contentType: r.headers.get('content-type'),
          bodyLength: rawBody.length,
          bodyPreview: preview,
        }),
      );
      return null;
    }
    auth.saveToken(token);
    debugLog('meta-ts-session: token renovado via /api/auth/session');
    return token;
  } catch (e) {
    logError(e, {
      category: 'network',
      severity: 'high',
      operation: 'meta-ts-session.refresh',
      metadata: {
        url,
        isTimeout: (e as { name?: string })?.name === 'FetchTimeoutError',
      },
    });
    return null;
  }
}

/* v8 ignore next 3 -- helper só pra testes */
export function _resetForTests(): void {
  inflightRefresh = null;
}
