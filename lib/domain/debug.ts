import { DEBUG } from './build-flags';
import { appendLog } from './log-store';

const PREFIX = '[Senior Ponto]';

export function debugLog(...args: unknown[]): void {
  appendLog('log', [PREFIX, ...args]);
  if (!DEBUG) return;
  console.log(PREFIX, ...args);
}

/**
 * Log de auditoria: mesma saída do debugLog, mas a entrada vai também para o
 * ring protegido do log-store, imune ao FIFO ruidoso do build de diagnóstico.
 *
 * Use para eventos raros e decisivos que precisam sobreviver horas até o
 * usuário exportar — hoje, todo o ciclo da batida automática.
 */
export function auditLog(...args: unknown[]): void {
  appendLog('log', [PREFIX, ...args], { pinned: true });
  if (!DEBUG) return;
  console.log(PREFIX, ...args);
}

export function debugWarn(...args: unknown[]): void {
  appendLog('warn', [PREFIX, ...args]);
  if (!DEBUG) return;
  console.warn(PREFIX, ...args);
}

export function errorLog(...args: unknown[]): void {
  appendLog('error', [PREFIX, ...args]);
  console.error(PREFIX, ...args);
}
