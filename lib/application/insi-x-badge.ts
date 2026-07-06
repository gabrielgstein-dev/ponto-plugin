import type { InsiXState } from '../domain/types';
import { getInsiXStatus } from '../domain/insi-x-status';

const BADGE_BG_URGENT = '#ca2d7e';

export async function refreshInsiXBadge(now: Date = new Date()): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  const data = await chrome.storage.local.get(['pontoSettings', 'insiXState']);
  const enabled = data.pontoSettings?.insiXReminder !== false;
  if (!enabled) {
    await clearBadge();
    return;
  }
  const status = getInsiXStatus(now, data.insiXState as InsiXState | null);
  if (status.tone === 'urgent') {
    await setBadge('!', BADGE_BG_URGENT);
    return;
  }
  await clearBadge();
}

async function setBadge(text: string, color: string): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    // Ignore — em contextos de teste ou se chrome.action não suporta
  }
}

async function clearBadge(): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch {
    // Ignore
  }
}
