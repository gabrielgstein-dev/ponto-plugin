export interface PunchState {
  entrada: string | null;
  almoco: string | null;
  volta: string | null;
  saida: string | null;
  _almocoSugerido?: string | null;
  _voltaSugerida?: string | null;
  _saidaEstimada?: string | null;
}

export interface Settings {
  jornada: number;
  almocoHorario: string;
  almocoDur: number;
  notifAntecip: number;
  lembreteAtraso: number;
  closingDay: number;
}

export interface PunchDetectionResult {
  times: string[];
  source: string;
}

export interface GpAuthData {
  assertion: string;
  colaboradorId: string | null;
  codigoCalculo: string | null;
}

export interface PunchResult {
  success: boolean;
  logs: string[];
  responseBody?: string;
}

export type PunchSlot = 'entrada' | 'almoco' | 'volta' | 'saida';

export const PUNCH_SLOTS: PunchSlot[] = ['entrada', 'almoco', 'volta', 'saida'];

export const DEFAULT_STATE: PunchState = {
  entrada: null,
  almoco: null,
  volta: null,
  saida: null,
};

export const DEFAULT_SETTINGS: Settings = {
  jornada: 480,
  almocoHorario: '12:00',
  almocoDur: 60,
  notifAntecip: 10,
  lembreteAtraso: 30,
  closingDay: 28,
};

export interface DayRecord {
  date: string;
  punches: string[];
  workedMinutes: number;
  balanceMinutes: number;
}

export interface HourBankBalance {
  totalMinutes: number;
  periodStart: string;
  periodEnd: string;
  carryOverMinutes: number;
}

export type TimesheetEntryStatus = 'PENDING' | 'APPROVED' | 'REPROVED';

export interface TimesheetEntry {
  id: string;
  date: string;
  hourQuantity: number;
  status: TimesheetEntryStatus;
  costCenter: { code: string; name: string } | null;
  task: { id: string; name: string } | null;
  observation: string | null;
  isAutomatic: boolean;
}

export interface TimesheetSummary {
  period: string;
  pendingHours: number;
  approvedHours: number;
  reprovedHours: number;
  totalReportedHours: number;
  entries: TimesheetEntry[];
}
