import { timeToMinutes, getNowMinutes } from '../domain/time-utils';
import { settings, notifScheduled } from './state';

interface NotifEntry {
  key: string;
  time: number;
  msg: string;
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
    entries.push({ key: 'notif_almoco', time: almocoHorarioMin - antecip, msg: `Hora do almoço em ${antecip} minutos!` });
    if (atraso > 0) {
      entries.push({ key: 'reminder_almoco', time: almocoHorarioMin + atraso, msg: `Você esqueceu de registrar o almoço? Já passou ${atraso}min do horário.` });
    }
  }

  if (almocoMin && !voltaMin) {
    const voltaSug = almocoMin + settings.almocoDur;
    entries.push({ key: 'notif_volta', time: voltaSug - antecip, msg: `Hora de voltar do almoço em ${antecip} minutos!` });
    entries.push({ key: 'notif_volta_now', time: voltaSug, msg: 'Registre a volta do almoço agora!' });
    if (atraso > 0) {
      entries.push({ key: 'reminder_volta', time: voltaSug + atraso, msg: `Você esqueceu de registrar a volta do almoço? Já passou ${atraso}min.` });
    }
  }

  if (saidaMin) {
    entries.push({ key: 'notif_saida', time: saidaMin - antecip, msg: `Saída em ${antecip} minutos! Prepare-se.` });
    entries.push({ key: 'notif_saida_now', time: saidaMin, msg: 'Hora de bater o ponto de saída!' });
    if (atraso > 0) {
      entries.push({ key: 'reminder_saida', time: saidaMin + atraso, msg: `Você esqueceu de registrar a saída? Já passou ${atraso}min do horário.` });
    }
  }

  const nowMin = getNowMinutes();
  const today = new Date();

  for (const { key, time, msg } of entries) {
    if (notifScheduled[key] || time <= nowMin) continue;
    notifScheduled[key] = true;

    const triggerDate = new Date(today);
    triggerDate.setHours(Math.floor(time / 60), time % 60, 0, 0);

    chrome.alarms.create(key, { when: triggerDate.getTime() });
    chrome.storage.local.set({ [`alarm_msg_${key}`]: msg });
  }
}
