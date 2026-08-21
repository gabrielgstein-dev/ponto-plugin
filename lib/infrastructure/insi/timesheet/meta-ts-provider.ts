import { createTimesheetProvider } from '../../timesheet/timesheet-provider';
import { metaTsAuth } from './meta-ts-auth';
import { META_TIMESHEET_CONFIG } from './constants';

// Fetch direto do service worker. host_permissions `*://api.meta.com.br/*`
// dá ao SW fetch privilegiado sem checagem CORS — substituiu fetchViaMetaTab,
// que dependia de aba aberta + executeScript em world MAIN. Confirmado por
// POC em 2026-05-07: GET /timesheets/v1/hours-summary?period=2026-05 → 200.
export const metaTimesheetProvider = createTimesheetProvider(
  META_TIMESHEET_CONFIG,
  metaTsAuth,
);
