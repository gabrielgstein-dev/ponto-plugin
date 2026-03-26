import type { IAuthProvider, IPunchRegistrar } from '../domain/interfaces';
import type { PunchResult } from '../domain/types';
import { debugLog, debugWarn } from '../domain/debug';

export async function registerPunch(
  authProviders: IAuthProvider[],
  registrar: IPunchRegistrar,
): Promise<PunchResult> {
  let accessToken: string | null = null;

  for (const provider of authProviders) {
    try {
      accessToken = await provider.getAccessToken();
      if (accessToken) {
        debugLog(`Token via ${provider.name}`);
        break;
      }
    } catch (e) {
      debugWarn(`Auth ${provider.name} falhou:`, (e as Error).message);
    }
  }

  if (!accessToken) {
    return { success: false, logs: ['Nenhum token encontrado'] };
  }

  return registrar.registerPunch(accessToken);
}
