/**
 * Renovação silenciosa do token Meta Timesheet via NextAuth.
 *
 * A plataforma Meta usa NextAuth.js com Keycloak (iamp.meta.com.br).
 * O JWT emitido dura 5 minutos, mas /api/auth/session retorna um
 * accessToken fresco usando o cookie de sessão NextAuth — sem redirect
 * SSO, sem abrir nova aba.
 *
 * Implementação: fetch direto do background com `credentials: 'include'`.
 * Validado em produção: o servidor NextAuth aceita extension origin e
 * envia o cookie HttpOnly de sessão automaticamente. Não dependemos de
 * aba aberta (versão antiga injetava script via chrome.scripting numa
 * aba da plataforma — caminho desnecessariamente complexo).
 *
 * Pré-requisito: manifest precisa ter `host_permissions` pra
 * plataforma.meta.com.br (já existe).
 */
import type { TimesheetConfig } from '../../timesheet/timesheet-config';
import type { TimesheetAuth } from '../../timesheet/timesheet-auth';
import { debugLog, debugWarn } from '../../../domain/debug';

/**
 * Tenta renovar o token silenciosamente via /api/auth/session.
 * Persiste no storage (via auth.saveToken) se bem-sucedido.
 * Retorna o accessToken renovado, ou null se não foi possível
 * (cookie de sessão expirado, sem rede, etc).
 */
export async function getMetaTsTokenSilently(
  config: TimesheetConfig,
  auth: TimesheetAuth,
): Promise<string | null> {
  const url = `${config.platformUrl}${config.sessionEndpoint}`;
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) {
      debugWarn(`meta-ts-session: ${url} retornou ${r.status}`);
      return null;
    }
    const data = await r.json() as { accessToken?: string };
    const token = data?.accessToken;
    if (typeof token !== 'string' || token.length < 20) {
      debugLog('meta-ts-session: resposta sem accessToken (sessão expirada?)');
      return null;
    }
    auth.saveToken(token);
    debugLog('meta-ts-session: token renovado via /api/auth/session');
    return token;
  } catch (e) {
    debugWarn('meta-ts-session: fetch falhou:', (e as Error).message);
    return null;
  }
}
