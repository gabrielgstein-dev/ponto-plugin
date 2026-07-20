import flags from './build-flags.json';

if (flags.ENABLE_MANUAL_PUNCH && flags.ENABLE_SENIOR_INTEGRATION) {
  throw new Error('[build-flags] ENABLE_MANUAL_PUNCH e ENABLE_SENIOR_INTEGRATION são mutuamente exclusivos.');
}

if (flags.ENABLE_SENIOR_PUNCH_BUTTON && !flags.ENABLE_SENIOR_INTEGRATION) {
  throw new Error('[build-flags] ENABLE_SENIOR_PUNCH_BUTTON requer ENABLE_SENIOR_INTEGRATION.');
}

if (flags.ENABLE_YESTERDAY && !flags.ENABLE_SENIOR_INTEGRATION) {
  throw new Error('[build-flags] ENABLE_YESTERDAY requer ENABLE_SENIOR_INTEGRATION.');
}

if ((flags as { ENABLE_AUTO_PUNCH?: boolean }).ENABLE_AUTO_PUNCH && !flags.ENABLE_SENIOR_INTEGRATION) {
  throw new Error('[build-flags] ENABLE_AUTO_PUNCH requer ENABLE_SENIOR_INTEGRATION.');
}

export const DEBUG = flags.DEBUG as boolean;
export const ACTIVE_COMPANY = flags.ACTIVE_COMPANY as string;
export const APP_NAME = flags.APP_NAME as string;
export const ENABLE_SENIOR_INTEGRATION = flags.ENABLE_SENIOR_INTEGRATION as boolean;
export const ENABLE_SENIOR_PUNCH_BUTTON = flags.ENABLE_SENIOR_PUNCH_BUTTON as boolean;
export const ENABLE_MANUAL_PUNCH = flags.ENABLE_MANUAL_PUNCH as boolean;
export const ENABLE_WIDGET = flags.ENABLE_WIDGET as boolean;
export const ENABLE_YESTERDAY = flags.ENABLE_YESTERDAY as boolean;
export const ENABLE_NOTIFICATIONS = flags.ENABLE_NOTIFICATIONS as boolean;
export const ENABLE_META_TIMESHEET = flags.ENABLE_META_TIMESHEET as boolean;
export const ENABLE_NETLOG_CAPTURE = (flags as { ENABLE_NETLOG_CAPTURE?: boolean }).ENABLE_NETLOG_CAPTURE ?? false;
export const ENABLE_SILENT_REFRESH = (flags as { ENABLE_SILENT_REFRESH?: boolean }).ENABLE_SILENT_REFRESH ?? false;
// Batida automática: registra o ponto sozinho no horário configurado (com jitter
// absorvido pela tolerância de apuração). Fora do build de loja por padrão — só
// age se ENABLE_AUTO_PUNCH=true E o usuário ligar `autoPunchEnabled` nas Settings.
// Requer o caminho de escrita Senior (executeScript numa aba), logo depende de
// ENABLE_SENIOR_INTEGRATION.
export const ENABLE_AUTO_PUNCH = (flags as { ENABLE_AUTO_PUNCH?: boolean }).ENABLE_AUTO_PUNCH ?? false;
export const THEME = flags.THEME as string;
