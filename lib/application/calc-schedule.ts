import { timeToMinutes, minutesToTime } from '../domain/time-utils';
import { state, settings } from './state';

export function calcHorarios(): void {
  state._almocoSugerido = null;
  state._voltaSugerida = null;
  state._saidaEstimada = null;

  const entMin = timeToMinutes(state.entrada);
  if (entMin == null) return;

  const almocoHorarioMin = timeToMinutes(settings.almocoHorario) || 720;

  if (!state.almoco) {
    state._almocoSugerido = minutesToTime(almocoHorarioMin);
  }

  if (!state.volta && !state.almoco) {
    state._saidaEstimada = minutesToTime(entMin + settings.jornada + settings.almocoDur);
  }

  if (state.volta) {
    calcWithVolta(entMin);
  } else if (state.almoco) {
    calcWithAlmoco(entMin);
  }
}

function calcWithVolta(entMin: number): void {
  const voltaMin = timeToMinutes(state.volta)!;
  const almocoMin = state.almoco ? timeToMinutes(state.almoco) : null;
  const horasAntesAlmoco = almocoMin ? almocoMin - entMin : 0;
  const actualLunch = almocoMin ? voltaMin - almocoMin : 0;
  const lunchDeficit = Math.max(0, settings.almocoDur - actualLunch);
  const horasRestantes = settings.jornada - horasAntesAlmoco;
  const saidaMin = voltaMin + horasRestantes + lunchDeficit;

  if (!state.saida) {
    state._saidaEstimada = minutesToTime(saidaMin);
  }
}

function calcWithAlmoco(entMin: number): void {
  const almocoMin = timeToMinutes(state.almoco)!;
  state._voltaSugerida = minutesToTime(almocoMin + settings.almocoDur);
  const horasAntesAlmoco = almocoMin - entMin;
  const horasRestantes = settings.jornada - horasAntesAlmoco;
  state._saidaEstimada = minutesToTime(almocoMin + settings.almocoDur + horasRestantes);
}
