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

export const ACTIVE_COMPANY = flags.ACTIVE_COMPANY as string;
export const APP_NAME = flags.APP_NAME as string;
export const ENABLE_SENIOR_INTEGRATION = flags.ENABLE_SENIOR_INTEGRATION as boolean;
export const ENABLE_SENIOR_PUNCH_BUTTON = flags.ENABLE_SENIOR_PUNCH_BUTTON as boolean;
export const ENABLE_MANUAL_PUNCH = flags.ENABLE_MANUAL_PUNCH as boolean;
export const ENABLE_WIDGET = flags.ENABLE_WIDGET as boolean;
export const ENABLE_YESTERDAY = flags.ENABLE_YESTERDAY as boolean;
export const ENABLE_NOTIFICATIONS = flags.ENABLE_NOTIFICATIONS as boolean;
export const ENABLE_META_TIMESHEET = flags.ENABLE_META_TIMESHEET as boolean;
