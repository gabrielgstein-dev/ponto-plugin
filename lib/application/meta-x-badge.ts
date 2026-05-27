import type { MetaXState } from '../domain/types';
import { getMetaXStatus } from '../domain/meta-x-status';

const BADGE_BG_URGENT = '#3b82f6';

export async function refreshMetaXBadge(now: Date = new Date()): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  const data = await chrome.storage.local.get(['pontoSettings', 'metaXState']);
  const enabled = data.pontoSettings?.metaXReminder !== false;
  if (!enabled) {
    await clearBadge();
    return;
  }
  const status = getMetaXStatus(now, data.metaXState as MetaXState | null);
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
