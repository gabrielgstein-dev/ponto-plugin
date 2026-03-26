import { ENABLE_SENIOR_INTEGRATION } from '../domain/build-flags';
import { resetTsScheduled } from './schedule-ts-notifications';
import { startReminder, resolveReminder } from './punch-reminder-manager';
import type { PunchReminderSlot } from '../domain/types';

const REMINDER_SLOT_MAP: Record<string, string> = {
  reminder_almoco: 'almoco',
  reminder_volta: 'volta',
  reminder_saida: 'saida',
};

const PUNCH_POPUP_SLOT_MAP: Record<string, PunchReminderSlot> = {
  punch_popup_almoco: 'almoco',
  punch_popup_volta: 'volta',
  punch_popup_saida: 'saida',
};

export async function handleDailyReset(): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  for (const a of alarms) {
    if (
      a.name.startsWith('notif_') ||
      a.name.startsWith('reminder_') ||
      a.name.startsWith('punch_popup_') ||
      a.name === 'punch_recheck' ||
      a.name.startsWith('ts_')
    ) {
      await chrome.alarms.clear(a.name);
    }
  }

  // Fecha popup aberto e limpa estado do lembrete (R6)
  const popupData = await chrome.storage.local.get(['punchPopupSlot', 'punchPopupWindowId']);
  const activeSlot = popupData.punchPopupSlot as PunchReminderSlot | null;
  if (activeSlot) {
    await resolveReminder(activeSlot);
  }

  const resetData: Record<string, unknown> = {
    pontoState: null,
    pontoDate: new Date().toDateString(),
  };
  if (ENABLE_SENIOR_INTEGRATION) {
    resetData.seniorToken = null;
    resetData.seniorTokenTs = null;
    resetData.seniorBearerToken = null;
    resetData.seniorBearerTs = null;
  }
  await chrome.storage.local.set(resetData);
  resetTsScheduled();
}

export async function handlePunchPopupAlarm(alarmName: string): Promise<void> {
  const slot = PUNCH_POPUP_SLOT_MAP[alarmName];
  if (!slot) return;
  const timeKey = `alarm_time_${alarmName}`;
  const data = await chrome.storage.local.get([timeKey]);
  const expectedTime = (data[timeKey] as string) || '';
  await startReminder(slot, expectedTime);
  await chrome.storage.local.remove(timeKey);
}

export async function handleReminderAlarm(alarmName: string): Promise<void> {
  const slot = REMINDER_SLOT_MAP[alarmName];
  const msgKey = `alarm_msg_${alarmName}`;
  const data = await chrome.storage.local.get(['pontoState', msgKey]);

  const ps = data.pontoState;
  if (ps && ps[slot]) {
    await chrome.storage.local.remove(msgKey);
    return;
  }

  const msg = data[msgKey];
  if (!msg) return;

  chrome.notifications.create(alarmName, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Senior Ponto — Lembrete',
    message: msg,
    priority: 2,
  }, (id: string) => {
    setTimeout(() => chrome.notifications.clear(id), 10000);
  });
  await chrome.storage.local.remove(msgKey);
}

export async function handleNotifAlarm(alarmName: string): Promise<void> {
  const msgKey = `alarm_msg_${alarmName}`;
  const data = await chrome.storage.local.get([msgKey]);
  const msg = data[msgKey];
  if (!msg) return;

  chrome.notifications.create(alarmName, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Senior Ponto',
    message: msg,
    priority: 2,
  }, (id: string) => {
    setTimeout(() => chrome.notifications.clear(id), 8000);
  });
  await chrome.storage.local.remove(msgKey);
}
