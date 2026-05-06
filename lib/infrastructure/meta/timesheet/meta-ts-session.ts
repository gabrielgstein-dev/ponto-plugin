/**
 * Renovação silenciosa do token Meta Timesheet via NextAuth.
 *
 * A plataforma Meta usa NextAuth.js com Keycloak (iamp.meta.com.br).
 * O JWT emitido dura 5 minutos, mas o endpoint /api/auth/session retorna
 * um accessToken fresco usando apenas o cookie de sessão — sem redirect SSO,
 * sem abrir nova aba.
 *
 * Estratégia:
 * 1. Se houver uma aba de plataforma.meta.com.br aberta, executa o fetch
 *    de /api/auth/session dentro dessa aba (same-origin, cookies automáticos).
 * 2. Fallback: tenta fetch direto do background com credentials:'include'
 *    (funciona quando a extensão tem host_permissions para o domínio).
 */
import type { TimesheetConfig } from '../../timesheet/timesheet-config';
import type { TimesheetAuth } from '../../timesheet/timesheet-auth';
import { debugLog } from '../../../domain/debug';
import { logError } from '../../../domain/error-logger';

async function findExistingPlatformTab(platformUrl: string): Promise<number | null> {
  try {
    const origin = new URL(platformUrl).origin;
    const tabs = await chrome.tabs.query({ status: 'complete' });
    const tab = tabs.find(t => t.url?.startsWith(origin) && t.id != null);
    return tab?.id ?? null;
  } catch (e) {
    logError(e, {
      category: 'unknown',
      severity: 'low',
      operation: 'meta-ts-session.findExistingPlatformTab',
    });
    return null;
  }
}

async function fetchSessionViaTab(tabId: number): Promise<string | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (): Promise<string | null> => {
        try {
          const r = await fetch('/api/auth/session');
          if (!r.ok) return null;
          const data = await r.json() as { accessToken?: string };
          return data?.accessToken ?? null;
        } catch {
          return null;
        }
      },
    });
    const token = results?.[0]?.result;
    return (typeof token === 'string' && token.length > 20) ? token : null;
  } catch (e) {
    logError(e, {
      category: 'auth',
      severity: 'medium',
      operation: 'meta-ts-session.fetchSessionViaTab',
      metadata: { tabId },
    });
    return null;
  }
}

async function fetchSessionViaBackground(platformUrl: string): Promise<string | null> {
  try {
    const r = await fetch(`${platformUrl}/api/auth/session`, {
      credentials: 'include',
    });
    if (!r.ok) return null;
    const data = await r.json() as { accessToken?: string };
    return data?.accessToken ?? null;
  } catch (e) {
    logError(e, {
      category: 'network',
      severity: 'medium',
      operation: 'meta-ts-session.fetchSessionViaBackground',
      metadata: { url: `${platformUrl}/api/auth/session` },
    });
    return null;
  }
}

/**
 * Tenta renovar o token silenciosamente sem abrir nova aba.
 * Salva o token no storage se bem-sucedido.
 * Retorna o token renovado, ou null se não foi possível.
 */
export async function getMetaTsTokenSilently(
  config: TimesheetConfig,
  auth: TimesheetAuth,
): Promise<string | null> {
  // Estratégia 1: aba existente da plataforma (same-origin, zero CORS)
  const tabId = await findExistingPlatformTab(config.platformUrl);
  if (tabId != null) {
    debugLog('meta-ts-session: aba existente encontrada (tabId=' + tabId + '), tentando /api/auth/session...');
    const token = await fetchSessionViaTab(tabId);
    if (token) {
      auth.saveToken(token);
      debugLog('meta-ts-session: token renovado via aba existente');
      return token;
    }
    debugLog('meta-ts-session: /api/auth/session falhou na aba existente');
  }

  // Estratégia 2: fetch direto do background (requer host_permissions)
  debugLog('meta-ts-session: tentando fetch direto do background...');
  const token = await fetchSessionViaBackground(config.platformUrl);
  if (token) {
    auth.saveToken(token);
    debugLog('meta-ts-session: token renovado via background fetch');
    return token;
  }

  debugLog('meta-ts-session: refresh silencioso falhou (sem aba e background bloqueado por CORS ou sem sessão)');
  return null;
}
