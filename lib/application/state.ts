import { DEFAULT_SETTINGS, DEFAULT_STATE } from '../domain/types';
import type { PunchState, Settings } from '../domain/types';

export const state: PunchState = { ...DEFAULT_STATE };
export const settings: Settings = { ...DEFAULT_SETTINGS };
export let notifScheduled: Record<string, boolean> = {};

export function resetState(): void {
  state.entrada = null;
  state.almoco = null;
  state.volta = null;
  state.saida = null;
  state._almocoSugerido = null;
  state._voltaSugerida = null;
  state._saidaEstimada = null;
}

export function resetNotifScheduled(): void {
  notifScheduled = {};
}

export function applyPartialState(partial: Partial<PunchState>): void {
  Object.assign(state, partial);
}

export function applySettings(partial: Partial<Settings>): void {
  Object.assign(settings, partial);
}
