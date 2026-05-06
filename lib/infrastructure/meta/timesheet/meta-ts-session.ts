/**
 * Renovação silenciosa do token Meta Timesheet via NextAuth.
 *
 * A plataforma Meta usa NextAuth.js com Keycloak (iamp.meta.com.br).
 * O JWT emitido dura 5min, mas /api/auth/session retorna um accessToken
 * fresco usando o cookie de sessão NextAuth — sem redirect SSO.
 *
 * Implementação: fetch direto do background com `credentials: 'include'`.
 * Validado em produção: o servidor NextAuth aceita extension origin e
 * envia o cookie HttpOnly de sessão automaticamente. Sem dependência
 * de aba aberta.
 *
 * Proteções:
 *   - Timeout de 5s
 *   - Single-flight lock
 *   - Feature flag ENABLE_SILENT_REFRESH
 *   - JWT validation antes de persistir
 */
import type { TimesheetConfig } from '../../timesheet/timesheet-config';
import type { TimesheetAuth } from '../../timesheet/timesheet-auth';
import { ENABLE_SILENT_REFRESH } from '../../../domain/build-flags';
import { debugLog } from '../../../domain/debug';
import { logError } from '../../../domain/error-logger';
import { fetchWithTimeout } from '../../../domain/fetch-utils';
import { isValidJWT } from '../../../domain/jwt-utils';

const REFRESH_TIMEOUT_MS = 5000;

let inflightRefresh: Promise<string | null> | null = null;

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
    const r = await fetchWithTimeout(url, {
      credentials: 'include',
      timeoutMs: REFRESH_TIMEOUT_MS,
    });
    if (!r.ok) {
      logError(new Error(`session endpoint returned ${r.status}`), {
        category: 'auth',
        severity: r.status === 401 ? 'medium' : 'high',
        operation: 'meta-ts-session.refresh',
        metadata: { status: r.status, url },
      });
      return null;
    }
    const data = await r.json() as { accessToken?: string };
    const token = data?.accessToken;
    if (typeof token !== 'string' || !isValidJWT(token)) {
      debugLog('meta-ts-session: resposta sem accessToken válido (sessão expirada?)');
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
