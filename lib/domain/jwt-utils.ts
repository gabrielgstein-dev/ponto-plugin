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

/**
 * Formata `exp` Unix em algo legível pra log: `1780097413 (expirou há 64d)`
 * ou `1780097413 (expira em 2h)`. `nowMs` opcional pra testes determinísticos.
 */
export function formatJwtExp(exp: number, nowMs: number = Date.now()): string {
  const expMs = exp * 1000;
  const diffMs = expMs - nowMs;
  const verb = diffMs >= 0 ? 'expira em' : 'expirou há';
  return `${exp} (${verb} ${formatDuration(Math.abs(diffMs))})`;
}

/**
 * Duração humana enxuta — útil pra log de idade/expiração.
 * Sempre 1 unidade dominante: `64d`, `3h`, `12m`, `45s`.
 */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
