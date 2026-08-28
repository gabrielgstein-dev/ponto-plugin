import { timeToMinutes, minutesToTime, getNowMinutes, isWeekend } from '../domain/time-utils';
import { ENABLE_AUTO_PUNCH } from '../domain/build-flags';
import { generateDailyOffsets, type SlotOffsets } from '../domain/auto-punch-jitter';
import { auditLog } from '../domain/debug';
import { settings } from './state';
import type { PunchReminderSlot, AutoPunchScheduleState } from '../domain/types';

export const AUTO_PUNCH_ALARM_PREFIX = 'autopunch_';

const OFFSETS_KEY = 'autoPunchOffsets';
const OFFSETS_DATE_KEY = 'autoPunchOffsetsDate';
export const AUTO_PUNCH_SCHEDULE_KEY = 'autoPunchSchedule';

/** Publica o estado que a UI lê para mostrar "vai bater X às HH:MM". */
async function publishSchedule(state: AutoPunchScheduleState): Promise<void> {
  try {
    await chrome.storage.local.set({ [AUTO_PUNCH_SCHEDULE_KEY]: state });
  } catch (_) { /* storage indisponível: a UI só não mostra o indicador */ }
}

/**
 * Offsets de jitter do dia. Persistidos e chaveados por data para serem
 * ESTÁVEIS ao longo do dia — a mesma tupla precisa valer pra entrada (manhã) e
 * saída (tarde), senão a neutralidade do total trabalhado não vale. Regenera na
 * virada do dia (ou se o SW reiniciar sem offsets salvos).
 */
export async function getTodayOffsets(): Promise<SlotOffsets> {
  const today = new Date().toDateString();
  const data = await chrome.storage.local.get([OFFSETS_KEY, OFFSETS_DATE_KEY]);
  if (data[OFFSETS_DATE_KEY] === today && data[OFFSETS_KEY]) {
    return data[OFFSETS_KEY] as SlotOffsets;
  }
  const offsets = generateDailyOffsets();
  await chrome.storage.local.set({ [OFFSETS_KEY]: offsets, [OFFSETS_DATE_KEY]: today });
  return offsets;
}

/** Slots com auto-punch ligado nas settings. */
export function autoPunchSlotsEnabled(): PunchReminderSlot[] {
  if (!ENABLE_AUTO_PUNCH || !settings.autoPunchEnabled) return [];
  const slots = settings.autoPunchSlots || {};
  return (['entrada', 'almoco', 'volta', 'saida'] as PunchReminderSlot[])
    .filter(s => slots[s] === true);
}

/**
 * Agenda os alarmes `autopunch_<slot>` para os slots habilitados e ainda não
 * batidos. Espelha a lógica de horário nominal de `scheduleNotifications`
 * (mesmo gate `weekdaysOnly && isWeekend`, mesmos inputs): só o "próximo" slot
 * computável é agendado por ciclo; após cada batida, o background-detect
 * re-chama esta função com o estado atualizado e agenda o slot seguinte.
 *
 * O horário de disparo é `nominal + offset[slot]` — o jitter é materializado
 * pelo `when` do alarme porque o registrador bate com o `new Date()` do momento
 * (não dá pra backdatar).
 */
export async function scheduleAutoPunch(
  entMin: number | null,
  almocoMin: number | null,
  voltaMin: number | null,
  saidaEstMin: number | null,
): Promise<void> {
  const enabled = autoPunchSlotsEnabled();
  // Feature/toggle off: sai calado de propósito (roda a cada bgDetect, 10min).
  if (enabled.length === 0) return;

  if (settings.weekdaysOnly && isWeekend()) {
    auditLog('Auto-punch: não agendado — fim de semana (weekdaysOnly ligado)');
    return;
  }

  const targets: Array<{ slot: PunchReminderSlot; timeMin: number }> = [];
  if (!entMin) {
    targets.push({ slot: 'entrada', timeMin: timeToMinutes(settings.entradaHorario) ?? 480 });
  }
  if (entMin && !almocoMin) {
    targets.push({ slot: 'almoco', timeMin: timeToMinutes(settings.almocoHorario) || 720 });
  }
  if (almocoMin && !voltaMin) {
    targets.push({ slot: 'volta', timeMin: almocoMin + settings.almocoDur });
  }
  if (saidaEstMin) {
    targets.push({ slot: 'saida', timeMin: saidaEstMin });
  }

  const todayStr = new Date().toDateString();
  const pending = targets.filter(t => enabled.includes(t.slot));
  if (pending.length === 0) {
    // Caso comum e importante de diagnosticar: o próximo slot da vez não é um
    // dos habilitados (ex.: só 'saida' ligada, mas o pendente agora é 'almoco').
    auditLog(
      `Auto-punch: nada a agendar — próximo(s) slot(s) pendente(s) = [${targets.map(t => t.slot).join(', ') || 'nenhum'}], habilitado(s) = [${enabled.join(', ')}]`,
    );
    await publishSchedule({ date: todayStr, scheduled: {}, waitingFor: targets[0]?.slot ?? null });
    return;
  }

  const offsets = await getTodayOffsets();
  const nowMin = getNowMinutes();
  const today = new Date();
  const scheduled: AutoPunchScheduleState['scheduled'] = {};

  for (const { slot, timeMin } of pending) {
    const offset = offsets[slot] ?? 0;
    const fireMin = timeMin + offset;
    const nominal = minutesToTime(timeMin) || '';
    const fireTime = minutesToTime(fireMin) || '';
    // Passou da hora: não bate no passado. O slot cai no lembrete/fallback normal.
    if (fireMin <= nowMin) {
      auditLog(
        `Auto-punch: ${slot} NÃO agendado — horário ${fireTime} já passou (agora ${minutesToTime(nowMin)})`,
      );
      continue;
    }
    const triggerDate = new Date(today);
    triggerDate.setHours(Math.floor(fireMin / 60), fireMin % 60, 0, 0);
    chrome.alarms.create(`${AUTO_PUNCH_ALARM_PREFIX}${slot}`, { when: triggerDate.getTime() });
    // Horário nominal (sem offset) guardado pro fallback: se a batida silenciosa
    // falhar, o lembrete manual mostra o horário esperado do slot.
    chrome.storage.local.set({
      [`alarm_time_${AUTO_PUNCH_ALARM_PREFIX}${slot}`]: minutesToTime(timeMin) || '',
    });
    scheduled[slot] = triggerDate.getTime();
    auditLog(`Auto-punch: ${slot} agendado para ${fireTime} (nominal ${nominal} + jitter ${offset}min)`);
  }

  await publishSchedule({ date: todayStr, scheduled, waitingFor: null });
}
