import type { PunchState, Settings } from '../domain/types';
import { DEFAULT_STATE, DEFAULT_SETTINGS } from '../domain/types';
import { timeToMinutes } from '../domain/time-utils';
import { ENABLE_NOTIFICATIONS } from '../domain/build-flags';
import { auditLog } from '../domain/debug';
import { applyPartialState, applySettings, state, resetNotifScheduled } from './state';
import { calcHorarios } from './calc-schedule';
import { scheduleNotifications } from './schedule-notifications';
import { scheduleAutoPunch } from './schedule-auto-punch';

/**
 * Alarmes que dependem do horário de SAÍDA e por isso precisam morrer antes de
 * serem recriados. `chrome.alarms.create` com o mesmo nome já substitui — mas
 * só quando o alarme é recriado. Quando o alvo VOLTA no tempo (ex.: o usuário
 * cancela a hora extra às 17:30 e a nova estimativa, 17:00, já passou),
 * `scheduleNotifications` pula a entrada (`time <= nowMin`) e o alarme antigo,
 * marcado pro horário esticado, continuaria armado e dispararia sozinho.
 */
const SAIDA_ALARMS = [
  'notif_saida',
  'notif_saida_5',
  'punch_popup_saida',
  'reminder_saida',
  'autopunch_saida',
];

/**
 * Recalcula os horários do dia e rearma os alarmes da saída, sem tocar na rede.
 *
 * Existe por causa da hora extra do dia: quando o usuário muda o alvo às 16:55,
 * o `autopunch_saida` já está armado pro horário antigo e o service worker só
 * releria `pontoState` no próximo `backgroundDetect` (ciclo de 10min — e mesmo
 * lá o guard `_lastHash` corta cedo se os batimentos não mudaram). Sem este
 * gatilho a UI mostraria 18:00 e o alarme bateria 17:00.
 *
 * Deliberadamente NÃO é o `FORCE_REDETECT`: aquele reseta todos os caches e faz
 * detecção agressiva (rede, abas). Trocar de "+1h" para "+1h30" não justifica
 * nada disso — aqui só relemos o storage e reagendamos.
 *
 * Fora de escopo: `ts_before_saida`. Ele também deriva da saída estimada, mas
 * seu atraso é inofensivo (cobra timesheet pendente, que segue pendente) e
 * puxá-lo pra cá arrastaria o gate do timesheet inteiro pra dentro deste módulo.
 * O próximo `backgroundDetect` corrige.
 */
export async function rescheduleDay(): Promise<void> {
  const data = await chrome.storage.local.get(['pontoState', 'pontoSettings', 'pontoDate']);
  const today = new Date().toDateString();

  let savedState: PunchState = { ...DEFAULT_STATE };
  let savedSettings: Settings = { ...DEFAULT_SETTINGS };
  if (data.pontoDate === today && data.pontoState) {
    savedState = { ...savedState, ...(data.pontoState as Partial<PunchState>) };
  }
  if (data.pontoSettings) {
    savedSettings = { ...savedSettings, ...(data.pontoSettings as Partial<Settings>) };
  }
  applyPartialState(savedState);
  applySettings(savedSettings);

  calcHorarios();

  for (const name of SAIDA_ALARMS) {
    try { await chrome.alarms.clear(name); } catch (_) { /* alarme inexistente */ }
  }

  // Sem isso o guard `notifScheduled[key]` impede a recriação do popup/lembrete
  // de saída — o alarme seria limpo acima e nunca voltaria.
  resetNotifScheduled();

  const entMin = timeToMinutes(state.entrada);
  const almocoMin = timeToMinutes(state.almoco);
  const voltaMin = timeToMinutes(state.volta);
  const saidaEstMin = timeToMinutes(state._saidaEstimada);

  if (ENABLE_NOTIFICATIONS) {
    scheduleNotifications(entMin, almocoMin, voltaMin, saidaEstMin);
  }
  await scheduleAutoPunch(entMin, almocoMin, voltaMin, saidaEstMin).catch(() => {});

  auditLog(
    `Reagendamento do dia: hora extra = ${state.horaExtra ?? 0}min, saída estimada = ${state._saidaEstimada ?? '--:--'}`,
  );
}
