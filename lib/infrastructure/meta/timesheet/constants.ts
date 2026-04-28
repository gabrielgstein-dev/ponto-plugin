import type { TimesheetConfig } from '../../timesheet/timesheet-config';

export const META_TIMESHEET_CONFIG: TimesheetConfig = {
  name: 'meta-timesheet',
  apiUrl: 'https://api.meta.com.br',
  platformUrl: 'https://plataforma.meta.com.br',
  // Login do Senior com tenant=meta.com.br e redirect direto pra plataforma.
  // Em uma aba escondida, abrir plataforma.meta.com.br sem o SSO travado
  // costuma falhar — passar por essa URL completa o login automaticamente
  // quando há cookies do Senior, e o tab final fica no origin que a API
  // (api.meta.com.br) aceita em CORS.
  bootstrapUrl:
    'https://platform.senior.com.br/login/?redirectTo=https%3A%2F%2Fplataforma.meta.com.br&tenant=meta.com.br',
  sessionEndpoint: '/api/auth/session',
  timesheetsBase: '/timesheets/v1',
  tokenMaxAgeMs: 4.5 * 60 * 1000,
  storagePrefix: 'metaTs',
  jwtUuidField: 'metaUUID',
};
