import { createTimesheetProvider } from '../../timesheet/timesheet-provider';
import { metaTsAuth } from './meta-ts-auth';
import { META_TIMESHEET_CONFIG } from './constants';

export const metaTimesheetProvider = createTimesheetProvider(META_TIMESHEET_CONFIG, metaTsAuth);
