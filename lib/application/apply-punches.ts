import { timeToMinutes, getNowMinutes } from '../domain/time-utils';
import { state, settings, resetNotifScheduled } from './state';
import { calcHorarios } from './calc-schedule';
import type { IStateRepository } from '../domain/interfaces';

export interface ApplyTimesContext {
  stateRepo: IStateRepository;
  onRender: () => void;
  onToast: (msg: string) => void;
}

export function applyTimes(
  times: string[],
  source: string,
  silent: boolean,
  ctx: ApplyTimesContext,
): boolean {
  if (!times || times.length === 0) {
    if (!silent) ctx.onToast('Nenhum batimento encontrado');
    return false;
  }

  const nowMin = getNowMinutes();
  const past = times.filter(t => (timeToMinutes(t) ?? 9999) <= nowMin + 5);
  if (past.length === 0) {
    if (!silent) ctx.onToast('Nenhum batimento válido');
    return false;
  }

  const currentSlots = [state.entrada, state.almoco, state.volta, state.saida].filter(Boolean).length;
  if (silent && past.length < currentSlots) return false;

  const oldHash = JSON.stringify({ e: state.entrada, a: state.almoco, v: state.volta, s: state.saida });

  state.entrada = past[0];
  state.almoco = null;
  state.volta = null;
  state.saida = null;

  assignLunchAndExit(past);

  const newHash = JSON.stringify({ e: state.entrada, a: state.almoco, v: state.volta, s: state.saida });
  const changed = oldHash !== newHash;

  calcHorarios();

  if (changed) {
    ctx.stateRepo.saveState(state).then(() => {
      resetNotifScheduled();
      ctx.onRender();
      const label = source === 'api' ? 'API' : source;
      ctx.onToast(silent ? '✓ Ponto atualizado!' : `✓ ${past.length} batimento(s) via ${label}!`);
    });
  } else if (!silent) {
    ctx.onRender();
  }

  return true;
}

function assignLunchAndExit(past: string[]): void {
  if (past.length < 2) return;

  const entradaMin = timeToMinutes(past[0])!;

  for (let i = 1; i < past.length - 1; i++) {
    const tMin = timeToMinutes(past[i])!;
    const tNextMin = timeToMinutes(past[i + 1])!;
    const gap = tNextMin - tMin;
    const workBefore = tMin - entradaMin;

    if (workBefore >= 120 && gap >= Math.min(settings.almocoDur, 30)) {
      state.almoco = past[i];
      state.volta = past[i + 1];
      if (i + 2 < past.length) state.saida = past[past.length - 1];
      return;
    }
  }

  const lastPunch = past[past.length - 1];
  const lastMin = timeToMinutes(lastPunch)!;
  const totalSpan = lastMin - entradaMin;

  if (totalSpan >= 120 && totalSpan < settings.jornada + settings.almocoDur) {
    state.almoco = lastPunch;
  }
}
