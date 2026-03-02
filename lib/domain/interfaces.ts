import type { PunchDetectionResult, PunchResult, PunchState, Settings, DayRecord, HourBankBalance } from './types';

export interface IAuthProvider {
  readonly name: string;
  getAccessToken(): Promise<string | null>;
}

export interface IPunchProvider {
  readonly name: string;
  readonly priority: number;
  fetchPunches(date: Date, aggressive?: boolean): Promise<string[]>;
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
