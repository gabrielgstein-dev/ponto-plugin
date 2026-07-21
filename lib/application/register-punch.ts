import type { IAuthProvider, IPunchRegistrar } from '../domain/interfaces';
import type { PunchResult } from '../domain/types';
import { debugLog, debugWarn } from '../domain/debug';

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

  return registrar.registerPunch(accessToken);
}
