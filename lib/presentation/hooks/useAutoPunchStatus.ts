import { useEffect, useState } from 'react';
import type {
  AutoPunchScheduleState,
  AutoPunchLastResult,
  PunchReminderSlot,
} from '../../domain/types';

const SCHEDULE_KEY = 'autoPunchSchedule';
const RESULT_KEY = 'autoPunchLastResult';
const HEALTH_KEY = 'detectionHealth';

export interface AutoPunchView {
  /** Próximo disparo automático de hoje: slot + epoch ms (jitter já aplicado). */
  next: { slot: PunchReminderSlot; fireAt: number } | null;
  /** Slot que trava a corrente (ex.: esperando a entrada ser batida). */
  waitingFor: PunchReminderSlot | null;
  /** Desfecho da última batida automática de hoje. */
  lastResult: AutoPunchLastResult | null;
  /**
   * Nenhuma fonte autoritativa respondeu no último detect. "Zero batidas" aqui
   * é ignorância, não fato — a UI precisa avisar em vez de mostrar `--:--`.
   */
  blind: boolean;
}

const EMPTY: AutoPunchView = { next: null, waitingFor: null, lastResult: null, blind: false };

function build(
  schedule: AutoPunchScheduleState | null,
  result: AutoPunchLastResult | null,
  today: string,
  now: number,
  health?: { blind?: boolean } | null,
): AutoPunchView {
  // Estado de dias anteriores não vale: o agendamento é diário.
  const sched = schedule && schedule.date === today ? schedule : null;
  const last = result && result.date === today ? result : null;

  let next: AutoPunchView['next'] = null;
  for (const [slot, fireAt] of Object.entries(sched?.scheduled ?? {})) {
    if (typeof fireAt !== 'number' || fireAt <= now) continue;
    if (!next || fireAt < next.fireAt) next = { slot: slot as PunchReminderSlot, fireAt };
  }

  return {
    next,
    waitingFor: sched?.waitingFor ?? null,
    lastResult: last,
    blind: health?.blind === true,
  };
}

/**
 * Lê o estado da batida automática publicado pelo background e reage a
 * mudanças. Existe para a UI responder "vai bater sozinho? quando?" — antes
 * disso o usuário só via o lembrete tocando e não sabia se algo aconteceria.
 */
export function useAutoPunchStatus(): AutoPunchView {
  const [view, setView] = useState<AutoPunchView>(EMPTY);

  useEffect(() => {
    let alive = true;

    const load = () => {
      chrome.storage.local.get([SCHEDULE_KEY, RESULT_KEY, HEALTH_KEY], (data) => {
        if (!alive) return;
        setView(build(
          (data?.[SCHEDULE_KEY] as AutoPunchScheduleState) ?? null,
          (data?.[RESULT_KEY] as AutoPunchLastResult) ?? null,
          new Date().toDateString(),
          Date.now(),
          (data?.[HEALTH_KEY] as { blind?: boolean }) ?? null,
        ));
      });
    };

    load();
    // Re-avalia a cada 30s para o "próximo" virar passado sozinho, sem depender
    // de o background reescrever o storage.
    const timer = setInterval(load, 30000);

    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return;
      if (SCHEDULE_KEY in changes || RESULT_KEY in changes || HEALTH_KEY in changes) load();
    };
    chrome.storage.onChanged.addListener(onChanged);

    return () => {
      alive = false;
      clearInterval(timer);
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return view;
}

export { build as _buildAutoPunchView };
