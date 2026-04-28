import { timeToMinutes, getNowMinutes } from '../domain/time-utils';
import { state, resetNotifScheduled } from './state';
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
  if (past.length >= 2) state.almoco = past[1];
  if (past.length >= 3) state.volta = past[2];
  if (past.length >= 4) state.saida = past[3];
}
