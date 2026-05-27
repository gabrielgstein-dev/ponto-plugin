import type { PunchReminderSlot, PunchState } from '../domain/types';
import { backgroundDetect, resetBackgroundHash } from './background-detect';
import { resetGpPunchCache } from '#company/providers';
import { resetSeniorApiCache } from '../infrastructure/senior/senior-api-provider';
import { resetSeniorStorageCache } from '../infrastructure/senior/senior-storage-provider';
import { resetSeniorActiveUserCache } from '../infrastructure/senior/senior-active-user-provider';

const RECHECK_ALARM = 'punch_recheck';

// Após esse intervalo desde startReminder, o popup escala: vira modo "user-agent"
// com 3 ações (Já bati / Abrir Senior / Parar lembretes). Antes do fix, o popup
// reabria a cada 5 min indefinidamente até dailyReset — incômodo crônico pra
// quem bate no celular e o plugin não consegue sincronizar.
const ESCALATION_THRESHOLD_MS = 20 * 60 * 1000;

const STORAGE_KEYS = [
  'punchPopupSlot',
  'punchPopupWindowId',
  'punchPopupExpectedTime',
  'punchPopupStartedTs',
  'punchPopupEscalated',
] as const;

// Slots que o user explicitamente dispensou hoje. Limpo por handleDailyReset.
export const DISMISSED_SLOTS_KEY = 'punchPopupDismissedSlots';

/**
 * Força fresh detect ANTES de qualquer decisão visível. Reseta TODOS os caches
 * (GP, SeniorApi, SeniorStorage, SeniorActiveUser, hash do bgDetect) e roda
 * uma detect completa.
 *
 * Necessário porque o `pontoState` no storage só atualiza a cada `bgDetect`
 * (10min) ou pull manual. Sem pre-flight, um batimento que aconteceu no
 * celular há 30s ainda não aparece no storage — e o popup de lembrete abre
 * por engano, gerando o sintoma "popup aparece mesmo eu tendo batido".
 */
async function preFlightDetect(): Promise<void> {
  resetGpPunchCache();
  resetSeniorApiCache();
  resetSeniorStorageCache();
  resetSeniorActiveUserCache();
  resetBackgroundHash();
  await backgroundDetect().catch(() => {});
}

export async function startReminder(slot: PunchReminderSlot, expectedTime: string): Promise<void> {
  // Pre-flight: refresh state ANTES de abrir popup. Sem isso, batimentos
  // recentes em outros canais (mobile, web em outro tab) não são vistos e o
  // popup abre indevidamente.
  await preFlightDetect();

  const data = await chrome.storage.local.get(['pontoState', 'punchPopupWindowId', DISMISSED_SLOTS_KEY]);
  const ps = data.pontoState as PunchState | null;

  // Guard NEW: slot dispensado explicitamente hoje — não reabre popup
  const dismissed = (data[DISMISSED_SLOTS_KEY] as PunchReminderSlot[] | undefined) ?? [];
  if (dismissed.includes(slot)) return;

  // Guard P6: jornada não iniciada (não se aplica ao slot 'entrada' — o popup
  // de entrada serve justamente para lembrar de iniciar a jornada)
  if (slot !== 'entrada' && !ps?.entrada) return;

  // Guard P7: jornada encerrada
  if (ps?.saida) {
    await chrome.alarms.clear(RECHECK_ALARM);
    await chrome.storage.local.remove([...STORAGE_KEYS]);
    return;
  }

  // Guard P3: slot já batido
  if (ps?.[slot]) return;

  // Salva keys ANTES de abrir janela (P1.4, P1.5). startedTs marca o início pra
  // calcular escalação no recheck.
  await chrome.storage.local.set({
    punchPopupSlot: slot,
    punchPopupExpectedTime: expectedTime,
    punchPopupStartedTs: Date.now(),
    punchPopupEscalated: false,
  });

  // Guard P4: janela já aberta?
  const windowId = data.punchPopupWindowId as number | undefined;
  if (windowId != null) {
    try {
      await chrome.windows.get(windowId);
      await scheduleRecheck();
      return; // Janela ainda aberta — não abre outra
    } catch {
      await chrome.storage.local.remove('punchPopupWindowId');
    }
  }

  await openPopupWindow(slot, expectedTime, false);
  await scheduleRecheck();
}

export async function recheckReminder(): Promise<void> {
  // Pre-flight: cada ciclo de 5min vira uma chance fresh de pegar sync de
  // outros canais (mobile, etc).
  await preFlightDetect();

  const data = await chrome.storage.local.get([
    'pontoState',
    'punchPopupSlot',
    'punchPopupWindowId',
    'punchPopupExpectedTime',
    'punchPopupStartedTs',
    DISMISSED_SLOTS_KEY,
  ]);

  const ps = data.pontoState as PunchState | null;
  const slot = data.punchPopupSlot as PunchReminderSlot | null;
  const expectedTime = (data.punchPopupExpectedTime as string | null) ?? '';

  if (!slot) return;

  // Guard NEW: slot dispensado
  const dismissed = (data[DISMISSED_SLOTS_KEY] as PunchReminderSlot[] | undefined) ?? [];
  if (dismissed.includes(slot)) {
    await resolveReminder(slot);
    return;
  }

  // Guard P6: sem entrada registrada (não se aplica ao slot 'entrada')
  if (slot !== 'entrada' && !ps?.entrada) {
    await resolveReminder(slot);
    return;
  }

  // Guard P7: jornada encerrada
  if (ps?.saida) {
    await resolveReminder(slot);
    return;
  }

  // Slot já batido? (pode ter sido pego pelo backgroundDetect acima)
  if (ps?.[slot]) {
    await resolveReminder(slot);
    return;
  }

  // Escalação: se passou o threshold sem detectar, abre em modo "user-agent"
  const startedTs = data.punchPopupStartedTs as number | undefined;
  const escalated = !!startedTs && Date.now() - startedTs > ESCALATION_THRESHOLD_MS;

  // Guard P4: janela ainda visível?
  const windowId = data.punchPopupWindowId as number | undefined;
  if (windowId != null) {
    try {
      await chrome.windows.get(windowId);
      await scheduleRecheck();
      return; // Janela aberta — não abre outra
    } catch {
      await chrome.storage.local.remove('punchPopupWindowId');
    }
  }

  await openPopupWindow(slot, expectedTime, escalated);
  await scheduleRecheck();
}

export async function snoozeReminder(
  slot: PunchReminderSlot,
  expectedTime: string,
  minutes: number,
): Promise<void> {
  const data = await chrome.storage.local.get(['punchPopupSlot', 'punchPopupWindowId']);
  const currentSlot = data.punchPopupSlot as PunchReminderSlot | null;
  if (currentSlot && currentSlot !== slot) return;

  await chrome.alarms.clear(RECHECK_ALARM);

  // Limpa estado do popup ANTES de fechar a janela — windows.onRemoved checa
  // punchPopupSlot pra decidir se trata como dismiss implícito; sem essa
  // limpeza, fechar a janela do snooze viraria dismiss.
  const windowId = data.punchPopupWindowId as number | undefined;
  await chrome.storage.local.remove([...STORAGE_KEYS]);

  // Reagenda usando o mesmo caminho de handlePunchPopupAlarm: alarm
  // punch_popup_<slot> + alarm_time_<key> com o expectedTime preservado.
  const alarmName = `punch_popup_${slot}`;
  await chrome.alarms.clear(alarmName);
  await chrome.storage.local.set({ [`alarm_time_${alarmName}`]: expectedTime });
  chrome.alarms.create(alarmName, { when: Date.now() + minutes * 60 * 1000 });

  if (windowId != null) {
    try {
      await chrome.windows.remove(windowId);
    } catch {
      // Janela já fechada — ignorar
    }
  }
}

export async function resolveReminder(slot: PunchReminderSlot): Promise<void> {
  const data = await chrome.storage.local.get(['punchPopupSlot', 'punchPopupWindowId']);
  const currentSlot = data.punchPopupSlot as PunchReminderSlot | null;

  // Só resolve se for o slot correto (P3/P5)
  if (currentSlot && currentSlot !== slot) return;

  await chrome.alarms.clear(RECHECK_ALARM);

  // Limpa storage ANTES de fechar a janela, pra que `windows.onRemoved` não
  // veja `punchPopupSlot` ainda setado e trate como dismiss implícito.
  const windowId = data.punchPopupWindowId as number | undefined;
  await chrome.storage.local.remove([...STORAGE_KEYS]);

  if (windowId != null) {
    try {
      await chrome.windows.remove(windowId);
    } catch {
      // Janela já fechada — ignorar
    }
  }
}

export async function dismissSlotForToday(slot: PunchReminderSlot): Promise<void> {
  const data = await chrome.storage.local.get(DISMISSED_SLOTS_KEY);
  const dismissed = (data[DISMISSED_SLOTS_KEY] as PunchReminderSlot[] | undefined) ?? [];
  if (!dismissed.includes(slot)) {
    dismissed.push(slot);
    await chrome.storage.local.set({ [DISMISSED_SLOTS_KEY]: dismissed });
  }
  await resolveReminder(slot);
}

export async function markSlotPunched(slot: PunchReminderSlot, time: string): Promise<void> {
  const data = await chrome.storage.local.get('pontoState');
  const state = (data.pontoState as PunchState | null) ?? {
    entrada: null, almoco: null, volta: null, saida: null,
  };
  state[slot] = time;
  await chrome.storage.local.set({ pontoState: state });
  await resolveReminder(slot);
}

async function openPopupWindow(slot: PunchReminderSlot, expectedTime: string, escalated: boolean): Promise<void> {
  const base = chrome.runtime.getURL('punch-reminder.html');
  const url = `${base}?slot=${slot}&time=${encodeURIComponent(expectedTime)}${escalated ? '&escalated=1' : ''}`;
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 420,
    height: 300,
    focused: true,
  });
  if (win.id != null) {
    await chrome.storage.local.set({
      punchPopupWindowId: win.id,
      punchPopupEscalated: escalated,
    });
  }
}

async function scheduleRecheck(): Promise<void> {
  await chrome.alarms.clear(RECHECK_ALARM);
  chrome.alarms.create(RECHECK_ALARM, { delayInMinutes: 5 });
}
