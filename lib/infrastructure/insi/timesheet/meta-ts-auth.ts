import { createTimesheetAuth } from '../../timesheet/timesheet-auth';
import { META_TIMESHEET_CONFIG } from './constants';

export const metaTsAuth = createTimesheetAuth(META_TIMESHEET_CONFIG);
