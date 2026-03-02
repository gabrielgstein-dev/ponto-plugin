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
