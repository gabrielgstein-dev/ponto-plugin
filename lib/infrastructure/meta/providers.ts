import type { IPunchProvider } from '../../domain/interfaces';
import type { ITimesheetProvider } from '../../domain/interfaces';
import { GpPunchProvider } from './gestaoponto/gp-provider';
import { metaTimesheetProvider } from './timesheet/meta-ts-provider';

// Entry point pro SSO Senior. O usuário cai em platform.senior.com.br,
// autentica e o cookie `.senior.com.br/com.senior.token` é setado — esse
// cookie é o que o resto da extensão precisa pra autenticar gestaoponto e
// pra capturar o Bearer via webRequest. O cookie de sessão NextAuth da
// plataforma Meta é estabelecido depois, na primeira navegação dela
// (silent refresh /api/auth/session usa esse cookie sem precisar de aba).
export const COMPANY_LOGIN_URL = 'https://platform.senior.com.br';

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
