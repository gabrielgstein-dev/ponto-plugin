import { timeToMinutes, minutesToTime, getNowMinutes } from '../domain/time-utils';
import { settings, notifScheduled } from './state';

interface NotifEntry {
  key: string;
  time: number;
  msg: string;
  expectedTime?: string;
}

export function scheduleNotifications(
  entMin: number | null,
  almocoMin: number | null,
  voltaMin: number | null,
  saidaMin: number | null,
): void {
  const antecip = settings.notifAntecip;
  const atraso = settings.lembreteAtraso;
  const entries: NotifEntry[] = [];

  if (entMin && !almocoMin) {
    const almocoHorarioMin = timeToMinutes(settings.almocoHorario) || 720;
    const almocoTime = minutesToTime(almocoHorarioMin) || settings.almocoHorario;
    entries.push({ key: 'notif_almoco', time: almocoHorarioMin - antecip, msg: `Hora do almoço em ${antecip} minutos!` });
    entries.push({ key: 'punch_popup_almoco', time: almocoHorarioMin, msg: '', expectedTime: almocoTime });
  }

  if (almocoMin && !voltaMin) {
    const voltaSug = almocoMin + settings.almocoDur;
    const voltaTime = minutesToTime(voltaSug) || '';
    entries.push({ key: 'notif_volta', time: voltaSug - antecip, msg: `Hora de voltar do almoço em ${antecip} minutos!` });
    entries.push({ key: 'punch_popup_volta', time: voltaSug, msg: '', expectedTime: voltaTime });
  }

  if (saidaMin) {
    const saidaTime = minutesToTime(saidaMin) || '';
    entries.push({ key: 'notif_saida', time: saidaMin - antecip, msg: `Saída em ${antecip} minutos! Prepare-se.` });
    entries.push({ key: 'punch_popup_saida', time: saidaMin, msg: '', expectedTime: saidaTime });
  }

  const nowMin = getNowMinutes();
  const today = new Date();

  for (const entry of entries) {
    const { key, time, msg } = entry;
    if (notifScheduled[key] || time <= nowMin) continue;
    notifScheduled[key] = true;

    const triggerDate = new Date(today);
    triggerDate.setHours(Math.floor(time / 60), time % 60, 0, 0);

    chrome.alarms.create(key, { when: triggerDate.getTime() });
    if (key.startsWith('punch_popup_') && entry.expectedTime != null) {
      chrome.storage.local.set({ [`alarm_time_${key}`]: entry.expectedTime });
    } else if (msg) {
      chrome.storage.local.set({ [`alarm_msg_${key}`]: msg });
    }
  }
}
