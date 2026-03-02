import type { TimesheetConfig } from '../../timesheet/timesheet-config';

export const META_TIMESHEET_CONFIG: TimesheetConfig = {
  name: 'meta-timesheet',
  apiUrl: 'https://api.meta.com.br',
  platformUrl: 'https://plataforma.meta.com.br',
  sessionEndpoint: '/api/auth/session',
  timesheetsBase: '/timesheets/v1',
  tokenMaxAgeMs: 4.5 * 60 * 1000,
  storagePrefix: 'metaTs',
  jwtUuidField: 'metaUUID',
};
