import { ENABLE_SENIOR_INTEGRATION, ENABLE_NOTIFICATIONS } from '../domain/build-flags';
import { resetTsScheduled } from './schedule-ts-notifications';
import { scheduleNotifications } from './schedule-notifications';
import { applySettings, resetNotifScheduled } from './state';
import { startReminder, resolveReminder, DISMISSED_SLOTS_KEY } from './punch-reminder-manager';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { PunchReminderSlot, Settings } from '../domain/types';

const REMINDER_SLOT_MAP: Record<string, PunchReminderSlot> = {
  reminder_entrada: 'entrada',
  reminder_almoco: 'almoco',
  reminder_volta: 'volta',
  reminder_saida: 'saida',
};

const PUNCH_POPUP_SLOT_MAP: Record<string, PunchReminderSlot> = {
  punch_popup_entrada: 'entrada',
  punch_popup_almoco: 'almoco',
  punch_popup_volta: 'volta',
  punch_popup_saida: 'saida',
};

// Alarmes do Chrome são persistidos e disparam imediatamente quando o SO
// acorda do sleep, mesmo que o horário agendado já tenha passado faz horas.
// Sem esse guard, um `reminder_saida` agendado pras 16:36 dispara à noite
// quando o usuário liga o notebook — notificação irrelevante (e errada, se o
// ponto já foi batido mas o storage ainda não sincronizou).
const STALE_ALARM_THRESHOLD_MS = 60 * 60 * 1000; // 1h

function isStaleAlarm(scheduledTime: number): boolean {
  return Date.now() - scheduledTime > STALE_ALARM_THRESHOLD_MS;
}

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

  // Fecha popup de timesheet e limpa cooldown
  const tsData = await chrome.storage.local.get('tsNotifWindowId');
  if (tsData.tsNotifWindowId) {
    try { await chrome.windows.remove(tsData.tsNotifWindowId); } catch (_) {}
  }
  await chrome.storage.local.remove(['tsNotifWindowId', 'tsNotifDismissedTs']);

  // Limpa dismissed slots — o user pode bater "Parar lembretes" hoje, mas
  // amanhã quer voltar a ser lembrado normalmente.
  await chrome.storage.local.remove(DISMISSED_SLOTS_KEY);

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
  resetNotifScheduled();

  // Carrega pontoSettings do storage ANTES de scheduleNotifications. Sem isso,
  // se o SW reiniciou recentemente (típico em alarm wake), `settings` em
  // memória estaria em DEFAULT_SETTINGS — entradaHorario=08:00 — e qualquer
  // dia em que o reset rodasse depois das 08:00, o popup_entrada não seria
  // agendado (time <= nowMin no schedule-notifications).
  const settingsData = await chrome.storage.local.get('pontoSettings');
  if (settingsData.pontoSettings) {
    applySettings({ ...DEFAULT_SETTINGS, ...(settingsData.pontoSettings as Partial<Settings>) });
  }

  // Reagenda alarmes do dia novo. Sem isso, o popup de entrada só era
  // agendado depois que um batimento fosse detectado — o que não acontece
  // antes da entrada ser batida. Cobre o caso do PC ficar ligado durante a
  // virada do dia.
  if (ENABLE_NOTIFICATIONS) {
    scheduleNotifications(null, null, null, null);
  }
}

export async function handlePunchPopupAlarm(alarmName: string, scheduledTime = Date.now()): Promise<void> {
  const slot = PUNCH_POPUP_SLOT_MAP[alarmName];
  if (!slot) return;
  const timeKey = `alarm_time_${alarmName}`;
  if (isStaleAlarm(scheduledTime)) {
    await chrome.storage.local.remove(timeKey);
    return;
  }
  const data = await chrome.storage.local.get([timeKey]);
  const expectedTime = (data[timeKey] as string) || '';
  await startReminder(slot, expectedTime);
  await chrome.storage.local.remove(timeKey);
}

export async function handleReminderAlarm(alarmName: string, scheduledTime = Date.now()): Promise<void> {
  const slot = REMINDER_SLOT_MAP[alarmName];
  const msgKey = `alarm_msg_${alarmName}`;
  if (isStaleAlarm(scheduledTime)) {
    await chrome.storage.local.remove(msgKey);
    return;
  }
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

export async function handleNotifAlarm(alarmName: string, scheduledTime = Date.now()): Promise<void> {
  const msgKey = `alarm_msg_${alarmName}`;
  if (isStaleAlarm(scheduledTime)) {
    await chrome.storage.local.remove(msgKey);
    return;
  }
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
