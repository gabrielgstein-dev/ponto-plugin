import type { IAuthProvider, IPunchRegistrar } from '../domain/interfaces';
import type { PunchResult } from '../domain/types';

export async function registerPunch(
  authProviders: IAuthProvider[],
  registrar: IPunchRegistrar,
): Promise<PunchResult> {
  let accessToken: string | null = null;

  for (const provider of authProviders) {
    try {
      accessToken = await provider.getAccessToken();
      if (accessToken) {
        console.log(`[Senior Ponto] Token via ${provider.name}`);
        break;
      }
    } catch (e) {
      console.warn(`[Senior Ponto] Auth ${provider.name} falhou:`, (e as Error).message);
    }
  }

  if (!accessToken) {
    return { success: false, logs: ['Nenhum token encontrado'] };
  }

  return registrar.registerPunch(accessToken);
}
