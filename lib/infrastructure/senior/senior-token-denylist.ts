import { debugLog } from '../../domain/debug';

/**
 * Lista de tokens Senior que a PLATAFORMA já rejeitou (HTTP 401 no bridge).
 *
 * Motivação (log de 2026-11-13): a sessão Senior do usuário foi revogada às
 * 07:03 e o mesmo token (`9UYG1q4g…`) continuou circulando até a batida das
 * 08:02 falhar. Três caminhos o traziam de volta, todos sem saber que ele já
 * tinha sido rejeitado:
 *   - o `webRequest` recapturava o token das requisições da aba Senior (que
 *     segue usando o token morto em memória) e das do próprio plugin;
 *   - o `SeniorPageAuth` relia o token do sessionStorage da aba;
 *   - o TTL local (6,5 dias, ver constants.ts) o tratava como válido.
 *
 * Só 401 do bridge entra aqui. 403 fica de fora de propósito: no Senior X ele
 * aparece para token válido sem escopo no serviço (ver comentário do
 * webRequest em background.ts), e 401 do GestaoPonto também, porque o GP tem
 * sua própria autenticação (decisão "BUG 2" em gp-auth.ts).
 *
 * Guarda o token inteiro: ele já está morto e as chaves vivas (`seniorToken`,
 * `seniorBearerToken`) já guardam tokens em claro no mesmo storage.
 */
export const SENIOR_REJECTED_TOKENS_KEY = 'seniorRejectedTokens';
const REJECTED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REJECTED = 20;

interface RejectedEntry {
  token: string;
  ts: number;
}

async function loadRejected(): Promise<RejectedEntry[]> {
  const stored = await chrome.storage.local.get([SENIOR_REJECTED_TOKENS_KEY]);
  const list = stored?.[SENIOR_REJECTED_TOKENS_KEY];
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  return (list as RejectedEntry[]).filter(
    e => e && typeof e.token === 'string' && typeof e.ts === 'number' && now - e.ts < REJECTED_TTL_MS,
  );
}

export async function isSeniorTokenRejected(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const list = await loadRejected();
  return list.some(e => e.token === token);
}

/**
 * Marca o token como rejeitado e o tira das chaves que o servem para o resto
 * do plugin (`seniorToken`, `seniorBearerToken`) — só se ainda for o mesmo
 * token: um token novo capturado nesse meio-tempo não pode ser apagado.
 */
export async function markSeniorTokenRejected(token: string, reason: string): Promise<void> {
  if (!token) return;
  const list = await loadRejected();
  if (!list.some(e => e.token === token)) {
    list.push({ token, ts: Date.now() });
  }
  await chrome.storage.local.set({ [SENIOR_REJECTED_TOKENS_KEY]: list.slice(-MAX_REJECTED) });

  const live = await chrome.storage.local.get(['seniorToken', 'seniorBearerToken']);
  const toRemove: string[] = [];
  if (live?.seniorToken === token) toRemove.push('seniorToken', 'seniorTokenTs');
  if (live?.seniorBearerToken === token) toRemove.push('seniorBearerToken', 'seniorBearerTs');
  if (toRemove.length) await chrome.storage.local.remove(toRemove);

  debugLog(`Senior: token ${token.slice(0, 8)}… rejeitado pela plataforma (${reason}) — não será reaproveitado`);
}

/**
 * Decide se um Bearer visto pelo `webRequest` deve ser gravado.
 *
 * - Requisição feita pela própria extensão (initiator `chrome-extension://`):
 *   não. O token veio do nosso storage; regravá-lo só "rejuvenesce" o
 *   timestamp e faz o log mentir sobre a idade real do token.
 * - Token já rejeitado pela plataforma: não. A aba Senior continua mandando
 *   o token morto até a SPA relogar.
 */
export async function shouldCaptureSeniorBearer(
  token: string,
  initiator: string | undefined,
): Promise<boolean> {
  if (initiator?.startsWith('chrome-extension://')) return false;
  return !(await isSeniorTokenRejected(token));
}
