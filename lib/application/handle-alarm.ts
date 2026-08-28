import { ENABLE_SENIOR_INTEGRATION, ENABLE_NOTIFICATIONS } from '../domain/build-flags';
import { resetTsScheduled } from './schedule-ts-notifications';
import { scheduleNotifications } from './schedule-notifications';
import { scheduleAutoPunch, AUTO_PUNCH_ALARM_PREFIX } from './schedule-auto-punch';
import { runAutoPunch } from './auto-punch';
import { openPunchPage } from './open-punch-page';
import { applySettings, resetNotifScheduled } from './state';
import { startReminder, resolveReminder, DISMISSED_SLOTS_KEY } from './punch-reminder-manager';
import { isSlotPunchedToday } from './punch-state';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { PunchReminderSlot, Settings, AutoPunchStatus, AutoPunchLastResult } from '../domain/types';
import { isReminderBlockedToday } from '../domain/weekday-gate';
import { auditLog } from '../domain/debug';

const REMINDER_SLOT_MAP: Record<string, PunchReminderSlot> = {
  reminder_entrada: 'entrada',
  reminder_almoco: 'almoco',
  reminder_volta: 'volta',
  reminder_saida: 'saida',
};

const PUNCH_POPUP_SLOT_MAP: Record<string, PunchReminderSlot> = {
  punch_popup_entrada: 'entrada',
  punch_popup_almoco: 'almoco',
  punch_popup_volta: 'volta',
  punch_popup_saida: 'saida',
};

const NOTIF_SLOT_MAP: Record<string, PunchReminderSlot> = {
  notif_entrada: 'entrada',
  notif_entrada_5: 'entrada',
  notif_almoco: 'almoco',
  notif_almoco_5: 'almoco',
  notif_volta: 'volta',
  notif_volta_5: 'volta',
  notif_saida: 'saida',
  notif_saida_5: 'saida',
};

// Alarmes do Chrome são persistidos e disparam imediatamente quando o SO
// acorda do sleep, mesmo que o horário agendado já tenha passado faz horas.
// Sem esse guard, um `reminder_saida` agendado pras 16:36 dispara à noite
// quando o usuário liga o notebook — notificação irrelevante (e errada, se o
// ponto já foi batido mas o storage ainda não sincronizou).
const STALE_ALARM_THRESHOLD_MS = 60 * 60 * 1000; // 1h

function isStaleAlarm(scheduledTime: number): boolean {
  return Date.now() - scheduledTime > STALE_ALARM_THRESHOLD_MS;
}

export async function handleDailyReset(): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  for (const a of alarms) {
    if (
      a.name.startsWith('notif_') ||
      a.name.startsWith('reminder_') ||
      a.name.startsWith('punch_popup_') ||
      a.name.startsWith(AUTO_PUNCH_ALARM_PREFIX) ||
      a.name === 'punch_recheck' ||
      a.name.startsWith('ts_')
    ) {
      await chrome.alarms.clear(a.name);
    }
  }

  // Fecha popup aberto e limpa estado do lembrete (R6)
  const popupData = await chrome.storage.local.get(['punchPopupSlot', 'punchPopupWindowId']);
  const activeSlot = popupData.punchPopupSlot as PunchReminderSlot | null;
  if (activeSlot) {
    await resolveReminder(activeSlot);
  }

  // Fecha popup de timesheet e limpa cooldown
  const tsData = await chrome.storage.local.get('tsNotifWindowId');
  if (tsData.tsNotifWindowId) {
    try { await chrome.windows.remove(tsData.tsNotifWindowId); } catch (_) {}
  }
  await chrome.storage.local.remove(['tsNotifWindowId', 'tsNotifDismissedTs']);

  // Limpa dismissed slots — o user pode bater "Parar lembretes" hoje, mas
  // amanhã quer voltar a ser lembrado normalmente.
  await chrome.storage.local.remove(DISMISSED_SLOTS_KEY);

  const resetData: Record<string, unknown> = {
    pontoState: null,
    pontoDate: new Date().toDateString(),
  };
  if (ENABLE_SENIOR_INTEGRATION) {
    // seniorBearerToken vem do content script injetado em *.senior.com.br —
    // sem refresh próprio, então limpar a cada noite força nova captura
    // quando o user voltar à plataforma. seniorToken NÃO entra aqui: tem TTL
    // nativo (SENIOR_TOKEN_MAX_AGE_MS=6.5d) + refresh silencioso via
    // seniorRefreshToken, e o cleanup diário derrubava o caminho B do
    // getSeniorAccessToken (só dispara refresh se seniorToken existe), deixando
    // users que batem só pelo celular eternamente deslogados após a primeira
    // meia-noite.
    resetData.seniorBearerToken = null;
    resetData.seniorBearerTs = null;
  }
  await chrome.storage.local.set(resetData);
  resetTsScheduled();
  resetNotifScheduled();

  // Carrega pontoSettings do storage ANTES de scheduleNotifications. Sem isso,
  // se o SW reiniciou recentemente (típico em alarm wake), `settings` em
  // memória estaria em DEFAULT_SETTINGS — entradaHorario=08:00 — e qualquer
  // dia em que o reset rodasse depois das 08:00, o popup_entrada não seria
  // agendado (time <= nowMin no schedule-notifications).
  const settingsData = await chrome.storage.local.get('pontoSettings');
  if (settingsData.pontoSettings) {
    applySettings({ ...DEFAULT_SETTINGS, ...(settingsData.pontoSettings as Partial<Settings>) });
  }

  // Reagenda alarmes do dia novo. Sem isso, o popup de entrada só era
  // agendado depois que um batimento fosse detectado — o que não acontece
  // antes da entrada ser batida. Cobre o caso do PC ficar ligado durante a
  // virada do dia.
  if (ENABLE_NOTIFICATIONS) {
    scheduleNotifications(null, null, null, null);
  }
  // Reagenda a batida automática do dia novo (offsets regeneram via getTodayOffsets
  // porque a data mudou). No-op se a feature/toggle estiver desligada.
  await scheduleAutoPunch(null, null, null, null).catch(() => {});
}

export async function handlePunchPopupAlarm(alarmName: string, scheduledTime = Date.now()): Promise<void> {
  const slot = PUNCH_POPUP_SLOT_MAP[alarmName];
  if (!slot) return;
  const timeKey = `alarm_time_${alarmName}`;
  if (isStaleAlarm(scheduledTime) || await isReminderBlockedToday()) {
    await chrome.storage.local.remove(timeKey);
    return;
  }
  const data = await chrome.storage.local.get([timeKey]);
  const expectedTime = (data[timeKey] as string) || '';
  await startReminder(slot, expectedTime);
  await chrome.storage.local.remove(timeKey);
}

export async function handleReminderAlarm(alarmName: string, scheduledTime = Date.now()): Promise<void> {
  const slot = REMINDER_SLOT_MAP[alarmName];
  const msgKey = `alarm_msg_${alarmName}`;
  if (isStaleAlarm(scheduledTime) || await isReminderBlockedToday()) {
    await chrome.storage.local.remove(msgKey);
    return;
  }
  if (await isSlotPunchedToday(slot)) {
    await chrome.storage.local.remove(msgKey);
    return;
  }

  const data = await chrome.storage.local.get(msgKey);
  const msg = data[msgKey];
  if (!msg) return;

  chrome.notifications.create(alarmName, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Ponto Insi — Lembrete',
    message: msg,
    priority: 2,
  }, (id: string) => {
    setTimeout(() => chrome.notifications.clear(id), 10000);
  });
  await chrome.storage.local.remove(msgKey);
}

const SLOT_LABELS: Record<PunchReminderSlot, string> = {
  entrada: 'entrada',
  almoco: 'almoço',
  volta: 'volta do almoço',
  saida: 'saída',
};

export const AUTO_PUNCH_RESULT_KEY = 'autoPunchLastResult';

/** Publica o desfecho para a UI mostrar sem obrigar o usuário a exportar log. */
async function publishAutoPunchResult(
  slot: PunchReminderSlot,
  status: AutoPunchStatus,
  time: string | null,
  reason: string | null,
): Promise<void> {
  try {
    const result: AutoPunchLastResult = {
      date: new Date().toDateString(),
      slot, status, time, reason, ts: Date.now(),
    };
    await chrome.storage.local.set({ [AUTO_PUNCH_RESULT_KEY]: result });
  } catch (_) { /* storage indisponível: a notificação já avisou */ }
}

export async function handleAutoPunchAlarm(alarmName: string, scheduledTime = Date.now()): Promise<void> {
  const slot = alarmName.slice(AUTO_PUNCH_ALARM_PREFIX.length) as PunchReminderSlot;
  if (!SLOT_LABELS[slot]) return;

  const timeKey = `alarm_time_${alarmName}`;
  const data = await chrome.storage.local.get(timeKey);
  const expectedTime = (data[timeKey] as string) || '';
  await chrome.storage.local.remove(timeKey);

  // Guards: alarme obsoleto (SO acordou tarde), dia bloqueado, ou slot já batido
  // (bateu no celular / manualmente antes do horário automático).
  // Cada saída é logada — "não bateu sozinho" precisa ter causa rastreável.
  if (isStaleAlarm(scheduledTime)) {
    const atrasoMin = Math.round((Date.now() - scheduledTime) / 60000);
    auditLog(`Auto-punch: ${slot} abortado — alarme obsoleto (${atrasoMin}min de atraso, provável sleep do SO)`);
    return;
  }
  if (await isReminderBlockedToday()) {
    auditLog(`Auto-punch: ${slot} abortado — dia bloqueado (fim de semana / weekdaysOnly)`);
    return;
  }
  if (await isSlotPunchedToday(slot)) {
    auditLog(`Auto-punch: ${slot} abortado — slot já batido hoje (manual/celular)`);
    return;
  }

  auditLog(`Auto-punch: disparando ${slot} (esperado ${expectedTime})...`);
  let result;
  try {
    result = await runAutoPunch();
  } catch (e) {
    result = { success: false, logs: [`exceção: ${(e as Error).message}`], punchTime: null, confirmed: false };
  }

  // Sucesso só vale com confirmação independente do servidor. Sem isso, o
  // plugin já afirmou "bati" com o histórico do Senior vazio — batida fantasma.
  if (result.success && result.confirmed) {
    const at = result.punchTime ? ` às ${result.punchTime}` : '';
    auditLog(`Auto-punch: ${slot} registrado e CONFIRMADO no servidor${at}`);
    await publishAutoPunchResult(slot, 'confirmed', result.punchTime, null);
    chrome.notifications.create(alarmName, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Ponto Insi — Batida automática',
      message: `Bati ${SLOT_LABELS[slot]}${at} automaticamente.`,
      priority: 2,
    }, (id: string) => {
      setTimeout(() => chrome.notifications.clear(id), 8000);
    });
    return;
  }

  if (result.success && !result.confirmed) {
    // O Senior aceitou o import mas a leitura independente não enxerga a
    // batida. Nunca afirmar que bateu — mandar o usuário conferir na fonte.
    auditLog(`Auto-punch: ${slot} NÃO CONFIRMADO — import aceito (${result.punchTime}) mas servidor não retorna a batida`);
    await publishAutoPunchResult(slot, 'unconfirmed', result.punchTime, 'servidor não retornou a batida');
    chrome.notifications.create(`${alarmName}_unconfirmed`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Ponto Insi — Batida NÃO confirmada',
      message: `Enviei ${SLOT_LABELS[slot]}, mas o Senior não confirmou. Confira no Senior e bata manualmente se preciso.`,
      priority: 2,
    });
    await openPunchPage().catch(() => {});
    await startReminder(slot, expectedTime).catch(() => {});
    return;
  }

  // Fallback: não deu pra bater em silêncio (token vencido / sem aba Senior).
  // `result.logs` carrega o motivo real vindo do registrar/auth providers
  // (ex.: "Nenhum token encontrado", "Nenhuma aba Senior encontrada", "Config
  // falhou: 401") — é essa linha que responde "por que não bateu".
  auditLog(`Auto-punch: FALHA em ${slot} — motivo: ${result.logs.join(' | ')}`);
  await publishAutoPunchResult(slot, 'failed', null, result.logs.join(' | ') || 'motivo desconhecido');

  // Notificação SEMPRE: startReminder tem guards próprios (slot dispensado,
  // jornada não iniciada) que podem não abrir popup nenhum. Sem isso, a falha
  // seria totalmente silenciosa pro usuário.
  chrome.notifications.create(`${alarmName}_fail`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Ponto Insi — Batida automática falhou',
    message: `Não consegui bater ${SLOT_LABELS[slot]} sozinho. Abri o Senior — bata manualmente.`,
    priority: 2,
  });

  try {
    await openPunchPage();
  } catch (e) {
    auditLog(`Auto-punch: fallback não conseguiu abrir a página do Senior: ${(e as Error).message}`);
  }
  try {
    await startReminder(slot, expectedTime);
  } catch (e) {
    auditLog(`Auto-punch: fallback não conseguiu abrir o lembrete de ${slot}: ${(e as Error).message}`);
  }
}

export async function handleNotifAlarm(alarmName: string, scheduledTime = Date.now()): Promise<void> {
  const msgKey = `alarm_msg_${alarmName}`;
  if (isStaleAlarm(scheduledTime) || await isReminderBlockedToday()) {
    await chrome.storage.local.remove(msgKey);
    return;
  }
  // Batimento adiantado: quem bate antes do aviso de antecipação não deve
  // ouvir "hora de bater em X minutos" de um ponto que já registrou.
  const slot = NOTIF_SLOT_MAP[alarmName];
  if (slot && await isSlotPunchedToday(slot)) {
    await chrome.storage.local.remove(msgKey);
    return;
  }
  const data = await chrome.storage.local.get([msgKey]);
  const msg = data[msgKey];
  if (!msg) return;

  chrome.notifications.create(alarmName, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Ponto Insi',
    message: msg,
    priority: 2,
  }, (id: string) => {
    setTimeout(() => chrome.notifications.clear(id), 8000);
  });
  await chrome.storage.local.remove(msgKey);
}
