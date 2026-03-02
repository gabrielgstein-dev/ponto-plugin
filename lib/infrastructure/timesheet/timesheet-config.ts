export interface TimesheetConfig {
  name: string;
  apiUrl: string;
  platformUrl: string;
  sessionEndpoint: string;
  timesheetsBase: string;
  tokenMaxAgeMs: number;
  storagePrefix: string;
  jwtUuidField: string;
}
