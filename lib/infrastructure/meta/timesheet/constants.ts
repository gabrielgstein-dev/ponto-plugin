import type { TimesheetConfig } from '../../timesheet/timesheet-config';

export const META_TIMESHEET_CONFIG: TimesheetConfig = {
  name: 'meta-timesheet',
  apiUrl: 'https://api.meta.com.br',
  platformUrl: 'https://plataforma.meta.com.br',
  // URL de login da própria plataforma com callback direto pra rota do
  // timesheet. Caindo em `/modules/timesheet/create` o SPA bootstrapa o
  // módulo de timesheet (e seus interceptors/clients de API). Sem isso,
  // chegar em `/` carrega só o dashboard e os fetches a `api.meta.com.br`
  // falham com "Failed to fetch" mesmo com token válido.
  // O SSO via Senior é encadeado pela própria plataforma.
  bootstrapUrl: 'https://plataforma.meta.com.br/login?callbackUrl=/modules/timesheet/create',
  sessionEndpoint: '/api/auth/session',
  timesheetsBase: '/timesheets/v1',
  tokenMaxAgeMs: 4.5 * 60 * 1000,
  storagePrefix: 'metaTs',
  jwtUuidField: 'metaUUID',
};
