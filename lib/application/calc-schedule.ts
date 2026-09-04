import { timeToMinutes, minutesToTime } from '../domain/time-utils';
import { jornadaAlvo } from '../domain/hora-extra';
import { state, settings } from './state';

/**
 * Jornada que vale HOJE: contrato + hora extra escolhida para o dia.
 *
 * Todo horário de saída (estimativa na UI, lembrete, alarme `autopunch_saida`,
 * notificação de timesheet) desce daqui — é o único ponto que precisa conhecer
 * o override. O banco de horas NÃO usa isto: lá o previsto continua sendo a
 * jornada contratual, senão o dia de hora extra fecharia com saldo zero.
 */
function jornadaHoje(): number {
  return jornadaAlvo(settings.jornada, state.horaExtra);
}

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
    state._saidaEstimada = minutesToTime(entMin + jornadaHoje() + settings.almocoDur);
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
  const almocoHorarioMin = timeToMinutes(settings.almocoHorario) ?? 720;
  const estimatedAlmocoMin = almocoMin ?? Math.max(entMin, almocoHorarioMin);
  const horasAntesAlmoco = estimatedAlmocoMin - entMin;
  const actualLunch = voltaMin - estimatedAlmocoMin;
  const lunchDeficit = Math.max(0, settings.almocoDur - actualLunch);
  const horasRestantes = jornadaHoje() - horasAntesAlmoco;
  const saidaMin = voltaMin + horasRestantes + lunchDeficit;

  if (!state.saida) {
    state._saidaEstimada = minutesToTime(saidaMin);
  }
}

function calcWithAlmoco(entMin: number): void {
  const almocoMin = timeToMinutes(state.almoco)!;
  state._voltaSugerida = minutesToTime(almocoMin + settings.almocoDur);
  const horasAntesAlmoco = almocoMin - entMin;
  const horasRestantes = jornadaHoje() - horasAntesAlmoco;
  state._saidaEstimada = minutesToTime(almocoMin + settings.almocoDur + horasRestantes);
}
