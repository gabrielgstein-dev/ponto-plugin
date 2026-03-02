import type { IPunchProvider } from '../../domain/interfaces';
import type { ITimesheetProvider } from '../../domain/interfaces';
import { GpPunchProvider } from './gestaoponto/gp-provider';
import { metaTimesheetProvider } from './timesheet/meta-ts-provider';

export function getCompanyPunchProviders(): IPunchProvider[] {
  return [new GpPunchProvider()];
}

export function getTimesheetProvider(): ITimesheetProvider {
  return metaTimesheetProvider;
}

export { getGpAssertion, invalidateGpCache } from './gestaoponto/gp-auth';
export { parseGpResponse } from './gestaoponto/gp-provider';
export { GP_API_BASE } from './gestaoponto/constants';
export { fetchGpHistoryForPeriod } from './gestaoponto/gp-history-provider';
export type { GpHistoryResult } from './gestaoponto/gp-history-provider';
