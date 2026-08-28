import type { PunchDetectionResult, PunchResult, PunchState, Settings, DayRecord, HourBankBalance, TimesheetSummary } from './types';

export interface IAuthProvider {
  readonly name: string;
  getAccessToken(): Promise<string | null>;
}

/**
 * 'ok'          → a fonte respondeu; `times` é verdade (podendo ser zero batidas)
 * 'unavailable' → a fonte NÃO pôde ser consultada (sem token, HTTP erro, cooldown
 *                 sem cache). `times` não significa "não bateu".
 */
export type ProbeOutcome = 'ok' | 'unavailable';

export interface PunchProbe {
  times: string[];
  outcome: ProbeOutcome;
}

export interface IPunchProvider {
  readonly name: string;
  readonly priority: number;
  fetchPunches(date: Date, aggressive?: boolean): Promise<string[]>;
  /**
   * Opcional. Implementado pelas fontes AUTORITATIVAS (servidor) para permitir
   * distinguir "zero batidas" de "não consegui consultar" — `fetchPunches`
   * devolve `[]` nos dois casos, e essa ambiguidade fez o plugin afirmar
   * "você não bateu" quando na verdade estava cego (incidente 2026-07-21).
   *
   * Caches locais (localStorage/scraper) NÃO implementam: eles não são verdade
   * sobre o servidor, então um "zero" vindo deles não desfaz a cegueira.
   */
  probe?(date: Date, aggressive?: boolean): Promise<PunchProbe>;
}

export interface IPunchRegistrar {
  registerPunch(accessToken: string): Promise<PunchResult>;
}

export interface IStateRepository {
  loadState(): Promise<{ state: PunchState; settings: Settings }>;
  saveState(state: PunchState): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
}

export interface IPunchDetector {
  detect(date: Date, aggressive?: boolean): Promise<PunchDetectionResult | null>;
}

export interface IHourBankProvider {
  getBalance(): Promise<HourBankBalance | null>;
  getHistory(from: string, to: string): Promise<DayRecord[]>;
  recalculate(settings: Settings): Promise<HourBankBalance>;
  closePeriod(settings: Settings): Promise<HourBankBalance>;
  ensureInitialized(closingDay: number): Promise<HourBankBalance>;
}

export interface ITimesheetProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  getSummary(period: string): Promise<TimesheetSummary | null>;
  updateEntry(entryId: string, entry: import('./types').TimesheetEntry, updates: { observation: string; hourQuantity: number }): Promise<boolean>;
  updateEntryWithAllocations?(entryId: string, entry: import('./types').TimesheetEntry, allocations: import('./types').CostCenterAllocation[]): Promise<boolean>;
}
