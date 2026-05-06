/**
 * Utilitários mínimos de JWT — só decode local pra checar expiração.
 * Nunca verifica assinatura (depende de chave do servidor).
 *
 * Importante: tokens não-JWT (opaque, ex.: Senior X access_token de 32 chars)
 * retornam `null` em decodeJwtPayload. isValidJWT trata como inválido.
 */

export interface JwtPayload {
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  if (typeof token !== 'string' || token.length < 20) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * True quando o token é JWT bem formado e ainda não expirou (com buffer
 * opcional em segundos pra renovar antes do servidor rejeitar).
 *
 * Tokens opaque (não-JWT) retornam false — quem usa precisa checar via
 * outro caminho (ex.: idade do storage).
 */
export function isValidJWT(token: string, bufferSec = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return Date.now() < (payload.exp - bufferSec) * 1000;
}
