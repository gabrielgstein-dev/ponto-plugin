export interface PunchState {
  entrada: string | null;
  almoco: string | null;
  volta: string | null;
  saida: string | null;
  _almocoSugerido?: string | null;
  _voltaSugerida?: string | null;
  _saidaEstimada?: string | null;
  _entradaTimestamp?: number;
}

export interface Settings {
  jornada: number;
  entradaHorario: string;
  almocoHorario: string;
  almocoDur: number;
  notifAntecip: number;
  lembreteAtraso: number;
  closingDay: number;
  soundEnabled: boolean;
  customSoundDataUrl: string | null;
  soundVolume: number;
  weekdaysOnly: boolean;
  paytrackReminder: boolean;
  insiXReminder: boolean;
  autoPunchEnabled: boolean;
  autoPunchSlots: Record<PunchReminderSlot, boolean>;
}

/**
 * Estado visível da batida automática. Existe para a UI poder responder, sem
 * adivinhação, "vai bater sozinho? quando?" — a pergunta que o usuário não
 * conseguia responder olhando só o lembrete tocando.
 */
export interface AutoPunchScheduleState {
  /** toDateString() do dia — descarta agendamento de dias anteriores. */
  date: string;
  /** slot -> epoch ms do disparo (já COM o jitter aplicado). */
  scheduled: Partial<Record<PunchReminderSlot, number>>;
  /**
   * Slot que trava a corrente quando nada pôde ser agendado. O agendamento é
   * encadeado (almoço só depois da entrada batida), então "nada agendado" quase
   * sempre significa "esperando este slot ser batido".
   */
  waitingFor: PunchReminderSlot | null;
}

export type AutoPunchStatus = 'confirmed' | 'unconfirmed' | 'failed';

export interface AutoPunchLastResult {
  date: string;
  slot: PunchReminderSlot;
  status: AutoPunchStatus;
  /** Horário HH:MM que o Senior devolveu, quando houve. */
  time: string | null;
  /** Motivo da falha, para a UI mostrar sem obrigar a exportar log. */
  reason: string | null;
  ts: number;
}

export interface InsiXState {
  lastRespondedWeekKey: string | null;
  lastRespondedAt: number | null;
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

export type PunchReminderSlot = 'entrada' | 'almoco' | 'volta' | 'saida';

export interface PunchReminderStorage {
  punchPopupSlot: PunchReminderSlot | null;
  punchPopupExpectedTime: string | null;
  punchPopupWindowId: number | null;
}

export const PUNCH_SLOTS: PunchSlot[] = ['entrada', 'almoco', 'volta', 'saida'];

export const DEFAULT_STATE: PunchState = {
  entrada: null,
  almoco: null,
  volta: null,
  saida: null,
};

export const DEFAULT_SETTINGS: Settings = {
  jornada: 480,
  entradaHorario: '08:00',
  almocoHorario: '12:00',
  almocoDur: 60,
  notifAntecip: 10,
  lembreteAtraso: 30,
  closingDay: 28,
  soundEnabled: true,
  customSoundDataUrl: null,
  soundVolume: 1,
  weekdaysOnly: true,
  paytrackReminder: true,
  insiXReminder: true,
  autoPunchEnabled: false,
  autoPunchSlots: { entrada: false, almoco: false, volta: false, saida: false },
};

export const DEFAULT_INSI_X_STATE: InsiXState = {
  lastRespondedWeekKey: null,
  lastRespondedAt: null,
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

export interface CostCenterAllocation {
  costCenter: { code: string; name: string };
  task: { id: string; name: string } | null;
  hourType: { id: string; description: string } | null;
  hours: number;
  observation: string;
}

export interface TimesheetEntry {
  id: string;
  date: string;
  hourQuantity: number;
  status: TimesheetEntryStatus;
  costCenter: { code: string; name: string } | null;
  costCenters?: Array<{ code: string; name: string }>;
  task: { id: string; name: string } | null;
  hourType: { id: string; description: string } | null;
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
