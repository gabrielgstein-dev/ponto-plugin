import { DEBUG } from './build-flags';

const PREFIX = '[Senior Ponto]';

export function debugLog(...args: unknown[]): void {
  if (!DEBUG) return;
  console.log(PREFIX, ...args);
}

export function debugWarn(...args: unknown[]): void {
  if (!DEBUG) return;
  console.warn(PREFIX, ...args);
}
