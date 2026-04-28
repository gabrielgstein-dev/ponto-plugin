import { DEBUG } from './build-flags';
import { appendLog } from './log-store';

const PREFIX = '[Senior Ponto]';

export function debugLog(...args: unknown[]): void {
  appendLog('log', [PREFIX, ...args]);
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
