import type { IPunchProvider } from '../../domain/interfaces';
import type { ITimesheetProvider } from '../../domain/interfaces';
import { GpPunchProvider } from './gestaoponto/gp-provider';
import { metaTimesheetProvider } from './timesheet/meta-ts-provider';

// Entry point pro SSO Senior do tenant Meta. Cair em
// plataforma.meta.com.br/login encadeia o fluxo de SSO via
// sso.senior.com.br/Keycloak e seta o cookie `.senior.com.br/com.senior.token`,
// que é o que o resto da extensão precisa pra autenticar gestaoponto e
// capturar o Bearer via webRequest.
export const COMPANY_LOGIN_URL = 'https://plataforma.meta.com.br/login';

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
