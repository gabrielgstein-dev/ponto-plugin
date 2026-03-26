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
      const userCostCenters = await fetchUserCostCenters(headers, userId);
      const entries = await fetchReportedHours(headers, userId, period, userCostCenters);
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

  async function fetchUserCostCenters(headers: Record<string, string>, userId: string): Promise<Array<{ code: string; name: string }>> {
    const url = `${apiUrl}${timesheetsBase}/users/${userId}/cost-centers`;
    debugLog(`${name} fetchUserCostCenters:`, url);
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) {
        debugLog(`${name} cost-centers não disponível (mock ativado):`, r.status);
        return [
          { code: '1001', name: 'Desenvolvimento de Software' },
          { code: '2002', name: 'Infraestrutura e DevOps' },
          { code: '3003', name: 'Suporte Técnico' },
        ];
      }
      const json = await r.json();
      if (Array.isArray(json.data)) {
        return json.data.map((cc: { code: string; name: string }) => ({ code: cc.code, name: cc.name }));
      }
      return [
        { code: '1001', name: 'Desenvolvimento de Software' },
        { code: '2002', name: 'Infraestrutura e DevOps' },
        { code: '3003', name: 'Suporte Técnico' },
      ];
    } catch (e) {
      debugLog(`${name} fetchUserCostCenters erro (mock ativado):`, (e as Error).message);
      return [
        { code: '1001', name: 'Desenvolvimento de Software' },
        { code: '2002', name: 'Infraestrutura e DevOps' },
        { code: '3003', name: 'Suporte Técnico' },
      ];
    }
  }

  async function fetchReportedHours(headers: Record<string, string>, userId: string, period: string, userCostCenters: Array<{ code: string; name: string }>): Promise<TimesheetEntry[]> {
    const url = `${apiUrl}${timesheetsBase}/users/${userId}/reported-hours?period=${period}&sort=-date`;
    debugLog(`${name} fetchReportedHours:`, url);
    const r = await fetch(url, { headers });
    if (!r.ok) {
      debugWarn(`${name} reported-hours:`, r.status);
      return [];
    }
    const json: ReportedHoursResponse = await r.json();
    return (json.data || []).map(raw => mapReportedHourToEntry(raw, userCostCenters));
  }

  async function updateEntry(entryId: string, entry: TimesheetEntry, updates: { observation: string; hourQuantity: number }): Promise<boolean> {
    const token = await auth.getToken();
    if (!token) {
      debugWarn(`${name}: sem token para updateEntry`);
      return false;
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const url = `${apiUrl}${timesheetsBase}/reported-hours/${entryId}`;
    debugLog(`${name} updateEntry:`, url, updates);

    try {
      const body = {
        observation: updates.observation,
        hourQuantity: updates.hourQuantity,
      };

      const r = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        debugWarn(`${name} updateEntry falhou:`, r.status, await r.text().catch(() => ''));
        return false;
      }

      debugLog(`${name} updateEntry OK`);
      return true;
    } catch (e) {
      debugWarn(`${name} updateEntry erro:`, (e as Error).message);
      return false;
    }
  }

  return { name, isAvailable, getSummary, updateEntry };
}

function mapReportedHourToEntry(raw: RawReportedHour, userCostCenters: Array<{ code: string; name: string }>): TimesheetEntry {
  const entry: TimesheetEntry = {
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

  if (userCostCenters.length > 1) {
    entry.costCenters = userCostCenters;
  }

  return entry;
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
