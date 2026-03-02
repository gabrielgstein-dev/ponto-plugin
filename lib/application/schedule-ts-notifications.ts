import { getNowMinutes } from '../domain/time-utils';
import { notifyPendingTimesheet } from './background-detect';

const TS_ALARM_PREFIX = 'ts_';
let _tsScheduled: Record<string, boolean> = {};

export function resetTsScheduled(): void {
  _tsScheduled = {};
}

export function scheduleTsNotifications(
  entradaMin: number | null,
  voltaMin: number | null,
  saidaEstMin: number | null,
  justDetectedEntrada: boolean,
  justDetectedVolta: boolean,
): void {
  const nowMin = getNowMinutes();
  const today = new Date();

  if (justDetectedVolta) {
    scheduleIfFuture('ts_on_volta', nowMin + 1, today, nowMin);
  }

  if (entradaMin) {
    scheduleIfFuture('ts_after_entrada', entradaMin + 120, today, nowMin);
  }

  if (voltaMin) {
    scheduleIfFuture('ts_after_volta', voltaMin + 120, today, nowMin);
  }

  if (saidaEstMin) {
    scheduleIfFuture('ts_before_saida', saidaEstMin - 30, today, nowMin);
  }
}

function scheduleIfFuture(key: string, triggerMin: number, today: Date, nowMin: number): void {
  if (_tsScheduled[key] || triggerMin <= nowMin) return;
  _tsScheduled[key] = true;

  const triggerDate = new Date(today);
  triggerDate.setHours(Math.floor(triggerMin / 60), triggerMin % 60, 0, 0);

  chrome.alarms.create(key, { when: triggerDate.getTime() });
  console.log(`[Senior Ponto] Alarm TS agendado: ${key} para ${Math.floor(triggerMin / 60)}:${String(triggerMin % 60).padStart(2, '0')}`);
}

export async function handleTsAlarm(alarmName: string): Promise<void> {
  if (!alarmName.startsWith(TS_ALARM_PREFIX)) return;
  console.log(`[Senior Ponto] Alarm TS disparado: ${alarmName}`);
  await notifyPendingTimesheet();
}
