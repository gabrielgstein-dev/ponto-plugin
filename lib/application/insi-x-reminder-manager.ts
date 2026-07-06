import type { InsiXState } from '../domain/types';
import { getIsoWeekKey, hasRespondedThisWeek } from '../domain/insi-x-status';
import { refreshInsiXBadge } from './insi-x-badge';

const STORAGE_KEYS = ['insiXPopupWindowId', 'insiXPopupContext'] as const;
const RECURRING_SNOOZE_ALARM = 'insi_x_snooze';
const DAILY_NOTIFY_ALARM = 'insi_x_notify';
const SNOOZE_MINUTES = 30;

export type InsiXPopupContext = 'morning' | 'exit_gate' | 'snooze' | 'afternoon_notif' | 'tuesday_preview';

export async function openInsiXPopup(context: InsiXPopupContext): Promise<void> {
  if (!(await isReminderEligible())) return;

  const data = await chrome.storage.local.get('insiXPopupWindowId');
  const windowId = data.insiXPopupWindowId as number | undefined;
  if (windowId != null) {
    try {
      await chrome.windows.get(windowId);
      return;
    } catch {
      await chrome.storage.local.remove('insiXPopupWindowId');
    }
  }

  await chrome.storage.local.set({ insiXPopupContext: context });
  const base = chrome.runtime.getURL('insi-x-reminder.html');
  const url = `${base}?ctx=${context}`;
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 460,
    height: 380,
    focused: true,
  });
  if (win.id != null) {
    await chrome.storage.local.set({ insiXPopupWindowId: win.id });
  }
}

export async function markInsiXResponded(now: Date = new Date()): Promise<void> {
  const state: InsiXState = {
    lastRespondedWeekKey: getIsoWeekKey(now),
    lastRespondedAt: now.getTime(),
  };
  await chrome.storage.local.set({ insiXState: state });
  await chrome.alarms.clear(RECURRING_SNOOZE_ALARM);
  await closePopup();
  await refreshInsiXBadge(now);
}

export async function snoozeInsiXReminder(): Promise<void> {
  await chrome.alarms.clear(RECURRING_SNOOZE_ALARM);
  chrome.alarms.create(RECURRING_SNOOZE_ALARM, { delayInMinutes: SNOOZE_MINUTES });
  await closePopup();
}

export async function handleInsiXSnoozeAlarm(): Promise<void> {
  if (!(await isReminderEligible())) return;
  await openInsiXPopup('snooze');
}

export async function handleInsiXDailyNotify(): Promise<void> {
  if (!(await isReminderEligible())) return;
  await openInsiXPopup('afternoon_notif');
  try {
    if (chrome.notifications) {
      chrome.notifications.create('insi-x-afternoon', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Insi X — hoje é quarta',
        message: 'Responda agora pra não esquecer. Leva 2min.',
        priority: 2,
      });
    }
  } catch {
    // Ignore
  }
}

export async function scheduleInsiXAfternoonAlarm(now: Date = new Date()): Promise<void> {
  if (now.getDay() !== 3) return;
  const target = new Date(now);
  target.setHours(16, 0, 0, 0);
  if (target.getTime() <= now.getTime()) return;
  await chrome.alarms.clear(DAILY_NOTIFY_ALARM);
  chrome.alarms.create(DAILY_NOTIFY_ALARM, { when: target.getTime() });
}

async function isReminderEligible(now: Date = new Date()): Promise<boolean> {
  const data = await chrome.storage.local.get(['pontoSettings', 'insiXState']);
  if (data.pontoSettings?.insiXReminder === false) return false;
  const day = now.getDay();
  if (day !== 2 && day !== 3) return false;
  if (hasRespondedThisWeek(data.insiXState as InsiXState | null, now)) return false;
  return true;
}

async function closePopup(): Promise<void> {
  const data = await chrome.storage.local.get('insiXPopupWindowId');
  const windowId = data.insiXPopupWindowId as number | undefined;
  await chrome.storage.local.remove([...STORAGE_KEYS]);
  if (windowId != null) {
    try {
      await chrome.windows.remove(windowId);
    } catch {
      // Janela já fechada
    }
  }
}

export { SNOOZE_MINUTES as INSI_X_SNOOZE_MINUTES };
export { RECURRING_SNOOZE_ALARM as INSI_X_SNOOZE_ALARM };
export { DAILY_NOTIFY_ALARM as INSI_X_NOTIFY_ALARM };
