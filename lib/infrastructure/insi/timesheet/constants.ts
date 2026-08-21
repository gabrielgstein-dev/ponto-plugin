import type { TimesheetConfig } from '../../timesheet/timesheet-config';

export const META_TIMESHEET_CONFIG: TimesheetConfig = {
  name: 'meta-timesheet',
  apiUrl: 'https://api.insi.com',
  platformUrl: 'https://plataforma.insi.com',
  // URL de login da própria plataforma com callback direto pra rota do
  // timesheet. Caindo em `/timesheet/create` o SPA bootstrapa o
  // módulo de timesheet (e seus interceptors/clients de API). Sem isso,
  // chegar em `/` carrega só o dashboard e os fetches a `api.insi.com`
  // falham com "Failed to fetch" mesmo com token válido.
  // O SSO via Senior é encadeado pela própria plataforma.
  // NOTE(2026-07): a plataforma migrou de `meta.com.br` p/ `insi.com`
  // (mesmos paths, mesmo JWT Keycloak com claim metaUUID). gestaoponto
  // segue em meta.com.br. Diagnóstico via netlog de prod.
  bootstrapUrl: 'https://plataforma.insi.com/login?callbackUrl=/timesheet/create',
  sessionEndpoint: '/api/auth/session',
  timesheetsBase: '/timesheets/v1',
  // Rede de segurança contra tokens absurdamente velhos no storage. Se o
  // token estiver inválido antes desse prazo, o handler de 401 do provider
  // limpa o storage e a próxima sync dispara o auto-connect.
  tokenMaxAgeMs: 24 * 60 * 60 * 1000,
  storagePrefix: 'metaTs',
  jwtUuidField: 'metaUUID',
};
