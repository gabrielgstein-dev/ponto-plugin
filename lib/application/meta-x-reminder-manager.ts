import type { MetaXState } from '../domain/types';
import { getIsoWeekKey, hasRespondedThisWeek } from '../domain/meta-x-status';
import { refreshMetaXBadge } from './meta-x-badge';

const STORAGE_KEYS = ['metaXPopupWindowId', 'metaXPopupContext'] as const;
const RECURRING_SNOOZE_ALARM = 'meta_x_snooze';
const DAILY_NOTIFY_ALARM = 'meta_x_notify';
const SNOOZE_MINUTES = 30;

export type MetaXPopupContext = 'morning' | 'exit_gate' | 'snooze' | 'afternoon_notif';

export async function openMetaXPopup(context: MetaXPopupContext): Promise<void> {
  if (!(await isReminderEligible())) return;

  const data = await chrome.storage.local.get('metaXPopupWindowId');
  const windowId = data.metaXPopupWindowId as number | undefined;
  if (windowId != null) {
    try {
      await chrome.windows.get(windowId);
      return;
    } catch {
      await chrome.storage.local.remove('metaXPopupWindowId');
    }
  }

  await chrome.storage.local.set({ metaXPopupContext: context });
  const base = chrome.runtime.getURL('meta-x-reminder.html');
  const url = `${base}?ctx=${context}`;
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 460,
    height: 380,
    focused: true,
  });
  if (win.id != null) {
    await chrome.storage.local.set({ metaXPopupWindowId: win.id });
  }
}

export async function markMetaXResponded(now: Date = new Date()): Promise<void> {
  const state: MetaXState = {
    lastRespondedWeekKey: getIsoWeekKey(now),
    lastRespondedAt: now.getTime(),
  };
  await chrome.storage.local.set({ metaXState: state });
  await chrome.alarms.clear(RECURRING_SNOOZE_ALARM);
  await closePopup();
  await refreshMetaXBadge(now);
}

export async function snoozeMetaXReminder(): Promise<void> {
  await chrome.alarms.clear(RECURRING_SNOOZE_ALARM);
  chrome.alarms.create(RECURRING_SNOOZE_ALARM, { delayInMinutes: SNOOZE_MINUTES });
  await closePopup();
}

export async function handleMetaXSnoozeAlarm(): Promise<void> {
  if (!(await isReminderEligible())) return;
  await openMetaXPopup('snooze');
}

export async function handleMetaXDailyNotify(): Promise<void> {
  if (!(await isReminderEligible())) return;
  await openMetaXPopup('afternoon_notif');
  try {
    if (chrome.notifications) {
      chrome.notifications.create('meta-x-afternoon', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Meta X — hoje é quarta',
        message: 'Responda agora pra não esquecer. Leva 2min.',
        priority: 2,
      });
    }
  } catch {
    // Ignore
  }
}

export async function scheduleMetaXAfternoonAlarm(now: Date = new Date()): Promise<void> {
  if (now.getDay() !== 3) return;
  const target = new Date(now);
  target.setHours(16, 0, 0, 0);
  if (target.getTime() <= now.getTime()) return;
  await chrome.alarms.clear(DAILY_NOTIFY_ALARM);
  chrome.alarms.create(DAILY_NOTIFY_ALARM, { when: target.getTime() });
}

async function isReminderEligible(now: Date = new Date()): Promise<boolean> {
  const data = await chrome.storage.local.get(['pontoSettings', 'metaXState']);
  if (data.pontoSettings?.metaXReminder === false) return false;
  const day = now.getDay();
  if (day !== 2 && day !== 3) return false;
  if (hasRespondedThisWeek(data.metaXState as MetaXState | null, now)) return false;
  return true;
}

async function closePopup(): Promise<void> {
  const data = await chrome.storage.local.get('metaXPopupWindowId');
  const windowId = data.metaXPopupWindowId as number | undefined;
  await chrome.storage.local.remove([...STORAGE_KEYS]);
  if (windowId != null) {
    try {
      await chrome.windows.remove(windowId);
    } catch {
      // Janela já fechada
    }
  }
}

export { SNOOZE_MINUTES as META_X_SNOOZE_MINUTES };
export { RECURRING_SNOOZE_ALARM as META_X_SNOOZE_ALARM };
export { DAILY_NOTIFY_ALARM as META_X_NOTIFY_ALARM };
