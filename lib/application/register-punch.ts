import type { IAuthProvider, IPunchRegistrar } from '../domain/interfaces';
import type { PunchResult } from '../domain/types';
import { debugLog, debugWarn } from '../domain/debug';
import { isSeniorTokenRejected, markSeniorTokenRejected } from '../infrastructure/senior/senior-token-denylist';

/**
 * Percorre a cadeia de auth e devolve o primeiro token disponível.
 *
 * Exportado para o `ensureSeniorTab` poder SONDAR a disponibilidade de token
 * (a aba recém-aberta leva segundos pra bootar e autenticar) sem disparar uma
 * batida a cada tentativa.
 */
export async function resolveAccessToken(
  authProviders: IAuthProvider[],
): Promise<string | null> {
  for (const provider of authProviders) {
    try {
      const token = await provider.getAccessToken();
      if (token) {
        // Token que a plataforma já rejeitou (ver senior-token-denylist.ts):
        // pula para o próximo provider em vez de bater com ele de novo.
        if (await isSeniorTokenRejected(token)) {
          debugLog(`Token via ${provider.name} ignorado — já rejeitado pela plataforma`);
          continue;
        }
        debugLog(`Token via ${provider.name}`);
        return token;
      }
    } catch (e) {
      debugWarn(`Auth ${provider.name} falhou:`, (e as Error).message);
    }
  }
  return null;
}

export async function registerPunch(
  authProviders: IAuthProvider[],
  registrar: IPunchRegistrar,
): Promise<PunchResult> {
  const accessToken = await resolveAccessToken(authProviders);

  if (!accessToken) {
    return { success: false, logs: ['Nenhum token encontrado'] };
  }

  const result = await registrar.registerPunch(accessToken);
  // "Config falhou: 401" = o bridge recusou o token (o registrar loga assim
  // em senior-registrar.ts). 403 não entra: é escopo, não token morto.
  if (!result.success && result.logs.some(l => /Config falhou: 401\b/.test(l))) {
    await markSeniorTokenRejected(accessToken, 'getEmployeeClockingConfigQuery 401');
  }
  return result;
}
