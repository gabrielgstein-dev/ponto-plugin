import type { IPunchProvider } from '../../domain/interfaces';
import type { ITimesheetProvider } from '../../domain/interfaces';
import { isValidJWT } from '../../domain/jwt-utils';
import { SENIOR_TOKEN_MAX_AGE_MS } from '../senior/constants';
import { GpPunchProvider } from './gestaoponto/gp-provider';
import { metaTimesheetProvider } from './timesheet/meta-ts-provider';

// Entry point pro SSO Senior. O usuário cai em platform.senior.com.br,
// autentica e o cookie `.senior.com.br/com.senior.token` é setado — esse
// cookie é o que o resto da extensão precisa pra autenticar gestaoponto e
// pra capturar o Bearer via webRequest. O cookie de sessão NextAuth da
// plataforma Meta é estabelecido depois, na primeira navegação dela
// (silent refresh /api/auth/session usa esse cookie sem precisar de aba).
export const COMPANY_LOGIN_URL = 'https://platform.senior.com.br';

export const COMPANY_NAME = 'Meta';

export const COMPANY_AUTH_STORAGE_KEYS = [
  'metaTsToken',
  'gpAssertion',
  'gpAssertionTs',
  'seniorToken',
  'seniorTokenTs',
] as const;

// Verdade única de "tem como ler dados de alguma fonte?". Qualquer caminho
// vivo (JWT Meta válido, assertion gestaoponto ou Senior token fresh) basta —
// um detector usa o que tiver. Quando todos falham é hora real de mostrar
// "desconectado" na UI.
export async function checkAuthStatus(): Promise<boolean> {
  const data = await chrome.storage.local.get(COMPANY_AUTH_STORAGE_KEYS as unknown as string[]);
  if (typeof data.metaTsToken === 'string' && isValidJWT(data.metaTsToken)) return true;
  if (data.gpAssertion && data.gpAssertionTs) return true;
  if (
    data.seniorToken &&
    data.seniorTokenTs &&
    Date.now() - (data.seniorTokenTs as number) < SENIOR_TOKEN_MAX_AGE_MS
  ) return true;
  return false;
}

export const COMPANY_PUNCH_URL = 'https://platform.senior.com.br/senior-x/#/Favoritos/1/res:%2F%2Fsenior.com.br%2Fhcm%2Fpontomobile%2FclockingEvent?category=frame&link=https:%2F%2Fplatform.senior.com.br%2Fhcm-pontomobile%2Fhcm%2Fpontomobile%2F%23%2Fclocking-event&withCredentials=true&r=0';

export function getCompanyPunchProviders(): IPunchProvider[] {
  return [new GpPunchProvider()];
}

export function getTimesheetProvider(): ITimesheetProvider {
  return metaTimesheetProvider;
}

export { getGpAssertion, invalidateGpCache } from './gestaoponto/gp-auth';
export { parseGpResponse, resetGpPunchCache } from './gestaoponto/gp-provider';
export { GP_API_BASE } from './gestaoponto/constants';
export { fetchGpHistoryForPeriod, getWorkedHoursForDate } from './gestaoponto/gp-history-provider';
export type { GpHistoryResult } from './gestaoponto/gp-history-provider';
