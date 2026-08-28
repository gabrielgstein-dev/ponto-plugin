import type { TimesheetConfig } from '../../timesheet/timesheet-config';

// Hosts atuais (ago/2026). `plataforma.meta.com.br` → 301 cego pra
// `plataforma.insi.com/` (perde o callbackUrl); a SPA nova chama
// `https://api.insi.com` (visto no bundle _next/static/chunks/*.js).
// Ver docs/roadmaps/roadmap-migracao-gp-insi.md.
export const META_TS_API_HOST = 'api.insi.com';
export const META_TS_PLATFORM_HOST = 'plataforma.insi.com';
export const META_TS_LEGACY_HOSTS = ['api.meta.com.br', 'plataforma.meta.com.br'] as const;

export const META_TIMESHEET_CONFIG: TimesheetConfig = {
  name: 'meta-timesheet',
  apiUrl: `https://${META_TS_API_HOST}`,
  platformUrl: `https://${META_TS_PLATFORM_HOST}`,
  // URL de login da própria plataforma com callback direto pra rota do
  // timesheet. Caindo em `/modules/timesheet/create` o SPA bootstrapa o
  // módulo de timesheet (e seus interceptors/clients de API). Sem isso,
  // chegar em `/` carrega só o dashboard e os fetches a `api.insi.com`
  // falham com "Failed to fetch" mesmo com token válido.
  // O SSO via Senior é encadeado pela própria plataforma.
  bootstrapUrl: `https://${META_TS_PLATFORM_HOST}/login?callbackUrl=/modules/timesheet/create`,
  sessionEndpoint: '/api/auth/session',
  timesheetsBase: '/timesheets/v1',
  // Rede de segurança contra tokens absurdamente velhos no storage. Se o
  // token estiver inválido antes desse prazo, o handler de 401 do provider
  // limpa o storage e a próxima sync dispara o auto-connect.
  tokenMaxAgeMs: 24 * 60 * 60 * 1000,
  storagePrefix: 'metaTs',
  jwtUuidField: 'metaUUID',
};
