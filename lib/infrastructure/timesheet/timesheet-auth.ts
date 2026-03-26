import type { TimesheetConfig } from './timesheet-config';
import { debugLog } from '../../domain/debug';

export interface TimesheetAuth {
  getToken(): Promise<string | null>;
  getUserId(): Promise<string | null>;
  saveToken(token: string): void;
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

  async function getToken(): Promise<string | null> {
    const stored = await chrome.storage.local.get([KEY_TOKEN, KEY_TS]);
    if (!stored[KEY_TOKEN]) return null;

    const age = Date.now() - (stored[KEY_TS] || 0);
    if (age >= config.tokenMaxAgeMs) {
      debugLog(`${config.name} auth: token expirado (${Math.round(age / 1000)}s)`);
      return null;
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

  return { getToken, getUserId, saveToken };
}
