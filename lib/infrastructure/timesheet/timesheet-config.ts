export interface TimesheetConfig {
  name: string;
  apiUrl: string;
  /** Origin que a API aceita em CORS — usado pra detectar abas válidas. */
  platformUrl: string;
  /**
   * URL para abrir uma aba escondida que dispara o SSO completo (ex.: login do
   * Senior com `tenant=` e `redirectTo=` apontando pra `platformUrl`). Sem
   * isso, abrir `platformUrl` direto numa aba escondida costuma travar antes
   * do SSO completar (sem gesto do usuário, sem tenant resolvido). Quando
   * indefinido, cai pra `platformUrl`.
   */
  bootstrapUrl?: string;
  /**
   * Substring esperada na URL final da aba após o SSO terminar. Usado pra
   * aguardar (via `webNavigation.onCompleted`) o SPA bootstrapar o módulo
   * antes de tentar `executeScript` — evita "Frame with ID 0 was removed"
   * quando o frame ainda está sendo trocado durante o redirect chain.
   * Quando indefinido, basta a URL estar no `platformUrl` origin.
   */
  expectedPathContains?: string;
  sessionEndpoint: string;
  timesheetsBase: string;
  tokenMaxAgeMs: number;
  storagePrefix: string;
  jwtUuidField: string;
}
