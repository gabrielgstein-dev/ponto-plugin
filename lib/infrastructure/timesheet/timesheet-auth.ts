import type { TimesheetConfig } from './timesheet-config';
import { debugLog, debugWarn } from '../../domain/debug';
import { formatJwtExp, formatDuration } from '../../domain/jwt-utils';

export interface TimesheetAuth {
  getToken(): Promise<string | null>;
  getUserId(): Promise<string | null>;
  saveToken(token: string): void;
  clearToken(): Promise<void>;
}

export function createTimesheetAuth(config: TimesheetConfig): TimesheetAuth {
  const KEY_TOKEN = `${config.storagePrefix}Token`;
  const KEY_TS = `${config.storagePrefix}TokenTs`;
  const KEY_UUID = `${config.storagePrefix}UserId`;

  function extractUserIdFromJwt(jwt: string): string | null {
    try {
      const parts = jwt.split('.');
      if (parts.length < 2) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload[config.jwtUuidField] || null;
    } catch (_) {
      return null;
    }
  }

  function extractExpFromJwt(jwt: string): number | null {
    try {
      const parts = jwt.split('.');
      if (parts.length < 2) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' ? payload.exp : null;
    } catch (_) {
      return null;
    }
  }

  async function getToken(): Promise<string | null> {
    const stored = await chrome.storage.local.get([KEY_TOKEN, KEY_TS]);
    if (!stored[KEY_TOKEN]) return null;

    // Preferência: checar o exp real do JWT (evita usar token expirado no servidor)
    const exp = extractExpFromJwt(stored[KEY_TOKEN]);
    if (exp !== null) {
      // Buffer de 30s: renova antes de expirar para evitar 401
      if (Date.now() >= (exp - 30) * 1000) {
        debugWarn(`${config.name} auth: JWT vencido — exp=${formatJwtExp(exp)}, renovação necessária`);
        return null;
      }
    } else {
      // Fallback para tokens sem exp: usa tempo de armazenamento
      const age = Date.now() - (stored[KEY_TS] || 0);
      if (age >= config.tokenMaxAgeMs) {
        debugWarn(`${config.name} auth: token expirado (idade ${formatDuration(age)})`);
        return null;
      }
    }

    return stored[KEY_TOKEN];
  }

  async function getUserId(): Promise<string | null> {
    const stored = await chrome.storage.local.get([KEY_UUID]);
    if (stored[KEY_UUID]) return stored[KEY_UUID];

    const token = await getToken();
    if (!token) return null;

    const uuid = extractUserIdFromJwt(token);
    if (uuid) {
      chrome.storage.local.set({ [KEY_UUID]: uuid });
    }
    return uuid;
  }

  function saveToken(token: string): void {
    const save: Record<string, unknown> = {
      [KEY_TOKEN]: token,
      [KEY_TS]: Date.now(),
    };

    const uuid = extractUserIdFromJwt(token);
    if (uuid) save[KEY_UUID] = uuid;

    chrome.storage.local.set(save);
  }

  async function clearToken(): Promise<void> {
    await chrome.storage.local.remove([KEY_TOKEN, KEY_TS]);
    debugLog(`${config.name} auth: token invalidado no storage`);
  }

  return { getToken, getUserId, saveToken, clearToken };
}
