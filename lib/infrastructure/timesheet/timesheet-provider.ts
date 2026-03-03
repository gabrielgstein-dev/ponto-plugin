import type { ITimesheetProvider } from '../../domain/interfaces';
import type { TimesheetSummary, TimesheetEntry, TimesheetEntryStatus } from '../../domain/types';
import type { TimesheetConfig } from './timesheet-config';
import type { TimesheetAuth } from './timesheet-auth';
import { debugLog, debugWarn } from '../../domain/debug';

export function createTimesheetProvider(config: TimesheetConfig, auth: TimesheetAuth): ITimesheetProvider {
  const { apiUrl, timesheetsBase, name } = config;

  async function isAvailable(): Promise<boolean> {
    const token = await auth.getToken();
    return token !== null;
  }

  async function getSummary(period: string): Promise<TimesheetSummary | null> {
    const token = await auth.getToken();
    if (!token) {
      debugLog(`${name}: sem token disponível`);
      return null;
    }

    const userId = await auth.getUserId();
    if (!userId) {
      debugWarn(`${name}: sem userId`);
      return null;
    }

    const headers: Record<string, string> = {
      'Accept': '*/*',
      'Authorization': `Bearer ${token}`,
    };

    try {
      const summaryData = await fetchHoursSummary(headers, period);
      const entries = await fetchReportedHours(headers, userId, period);
      const pendingEntries = entries.filter(e => e.status === 'PENDING');

      return {
        period,
        pendingHours: summaryData?.pendingHours ?? 0,
        approvedHours: summaryData?.approvedHours ?? 0,
        reprovedHours: summaryData?.repprovedHours ?? 0,
        totalReportedHours: summaryData?.totalReportedHours ?? 0,
        entries: pendingEntries,
      };
    } catch (e) {
      debugWarn(`${name} getSummary erro:`, (e as Error).message);
      return null;
    }
  }

  async function fetchHoursSummary(headers: Record<string, string>, period: string): Promise<HoursSummaryResponse | null> {
    const url = `${apiUrl}${timesheetsBase}/hours-summary?period=${period}`;
    debugLog(`${name} fetchHoursSummary:`, url);
    const r = await fetch(url, { headers });
    if (!r.ok) {
      debugWarn(`${name} hours-summary:`, r.status);
      return null;
    }
    return r.json();
  }

  async function fetchReportedHours(headers: Record<string, string>, userId: string, period: string): Promise<TimesheetEntry[]> {
    const url = `${apiUrl}${timesheetsBase}/users/${userId}/reported-hours?period=${period}&sort=-date`;
    debugLog(`${name} fetchReportedHours:`, url);
    const r = await fetch(url, { headers });
    if (!r.ok) {
      debugWarn(`${name} reported-hours:`, r.status);
      return [];
    }
    const json: ReportedHoursResponse = await r.json();
    return (json.data || []).map(mapReportedHourToEntry);
  }

  return { name, isAvailable, getSummary };
}

function mapReportedHourToEntry(raw: RawReportedHour): TimesheetEntry {
  return {
    id: raw.id,
    date: raw.date,
    hourQuantity: raw.hourQuantity,
    status: (raw.status?.title as TimesheetEntryStatus) || 'PENDING',
    costCenter: raw.costCenter ? { code: raw.costCenter.code, name: raw.costCenter.name } : null,
    task: raw.task ? { id: raw.task.id, name: raw.task.name } : null,
    hourType: raw.hourType ? { id: raw.hourType.id, description: raw.hourType.description } : null,
    observation: raw.observation || null,
    isAutomatic: raw.isAutomaticAppointment ?? false,
  };
}

interface HoursSummaryResponse {
  pendingHours: number;
  approvedHours: number;
  repprovedHours: number;
  totalReportedHours: number;
  countReportedHours: number;
}

interface RawReportedHour {
  id: string;
  date: string;
  hourQuantity: number;
  status: { title: string; date: string; justify: string | null };
  costCenter: { code: string; name: string } | null;
  task: { id: string; name: string } | null;
  hourType: { id: string; description: string } | null;
  observation: string | null;
  isAutomaticAppointment: boolean;
}

interface ReportedHoursResponse {
  data: RawReportedHour[];
  total: number;
}
