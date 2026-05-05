import { timeToMinutes, minutesToTime, getNowMinutes } from '../domain/time-utils';
import { settings, notifScheduled } from './state';
import type { PunchReminderSlot } from '../domain/types';

interface NotifEntry {
  key: string;
  time: number;
  msg: string;
  expectedTime?: string;
}

// 2º aviso de antecipação fixo em 5min — complementa o configurável `notifAntecip`
// (default 10min). Se o usuário configurar `notifAntecip=5`, o aviso de 5min é
// suprimido pra evitar duplicata.
const SECOND_ANTECIP_MIN = 5;

const SLOT_MESSAGES: Record<PunchReminderSlot, { antecip: (min: number) => string; atraso: (min: number) => string }> = {
  entrada: {
    antecip: m => `Hora de bater entrada em ${m} minutos!`,
    atraso: m => `Você ainda não bateu a entrada! (${m} min em atraso)`,
  },
  almoco: {
    antecip: m => `Hora do almoço em ${m} minutos!`,
    atraso: m => `Você ainda não bateu o almoço! (${m} min em atraso)`,
  },
  volta: {
    antecip: m => `Hora de voltar do almoço em ${m} minutos!`,
    atraso: m => `Você ainda não bateu a volta do almoço! (${m} min em atraso)`,
  },
  saida: {
    antecip: m => `Saída em ${m} minutos! Prepare-se.`,
    atraso: m => `Você ainda não bateu a saída! (${m} min em atraso)`,
  },
};

function pushSlotEntries(
  entries: NotifEntry[],
  slot: PunchReminderSlot,
  slotMin: number,
  slotTime: string,
  antecip: number,
  atraso: number,
): void {
  const { antecip: antecipMsg, atraso: atrasoMsg } = SLOT_MESSAGES[slot];

  if (antecip > 0) {
    entries.push({ key: `notif_${slot}`, time: slotMin - antecip, msg: antecipMsg(antecip) });
  }
  if (SECOND_ANTECIP_MIN > 0 && SECOND_ANTECIP_MIN !== antecip) {
    entries.push({ key: `notif_${slot}_5`, time: slotMin - SECOND_ANTECIP_MIN, msg: antecipMsg(SECOND_ANTECIP_MIN) });
  }
  entries.push({ key: `punch_popup_${slot}`, time: slotMin, msg: '', expectedTime: slotTime });
  if (atraso > 0) {
    entries.push({ key: `reminder_${slot}`, time: slotMin + atraso, msg: atrasoMsg(atraso) });
  }
}

export function scheduleNotifications(
  entMin: number | null,
  almocoMin: number | null,
  voltaMin: number | null,
  saidaEstMin: number | null,
): void {
  const antecip = settings.notifAntecip;
  const atraso = settings.lembreteAtraso;
  const entries: NotifEntry[] = [];

  if (!entMin) {
    const entradaHorarioMin = timeToMinutes(settings.entradaHorario) ?? 480;
    const entradaTime = minutesToTime(entradaHorarioMin) || settings.entradaHorario;
    pushSlotEntries(entries, 'entrada', entradaHorarioMin, entradaTime, antecip, atraso);
  }

  if (entMin && !almocoMin) {
    const almocoHorarioMin = timeToMinutes(settings.almocoHorario) || 720;
    const almocoTime = minutesToTime(almocoHorarioMin) || settings.almocoHorario;
    pushSlotEntries(entries, 'almoco', almocoHorarioMin, almocoTime, antecip, atraso);
  }

  if (almocoMin && !voltaMin) {
    const voltaSug = almocoMin + settings.almocoDur;
    const voltaTime = minutesToTime(voltaSug) || '';
    pushSlotEntries(entries, 'volta', voltaSug, voltaTime, antecip, atraso);
  }

  if (saidaEstMin) {
    const saidaTime = minutesToTime(saidaEstMin) || '';
    pushSlotEntries(entries, 'saida', saidaEstMin, saidaTime, antecip, atraso);
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
