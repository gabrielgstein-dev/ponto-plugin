import { createTimesheetProvider } from '../../timesheet/timesheet-provider';
import { metaTsAuth } from './meta-ts-auth';
import { META_TIMESHEET_CONFIG } from './constants';
import { fetchViaMetaTab } from './meta-ts-fetch';

// A API api.meta.com.br responde Access-Control-Allow-Origin apenas para
// https://plataforma.meta.com.br, então o fetch precisa rodar dentro de uma
// aba aberta nesse domínio (via chrome.scripting.executeScript em world MAIN).
export const metaTimesheetProvider = createTimesheetProvider(
  META_TIMESHEET_CONFIG,
  metaTsAuth,
  (url, init) => fetchViaMetaTab(META_TIMESHEET_CONFIG, url, init),
);
