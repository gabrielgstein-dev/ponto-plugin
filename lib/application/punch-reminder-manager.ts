import type { PunchReminderSlot, PunchState } from '../domain/types';

const RECHECK_ALARM = 'punch_recheck';
const STORAGE_KEYS = ['punchPopupSlot', 'punchPopupWindowId', 'punchPopupExpectedTime'] as const;

export async function startReminder(slot: PunchReminderSlot, expectedTime: string): Promise<void> {
  const data = await chrome.storage.local.get(['pontoState', 'punchPopupWindowId']);
  const ps = data.pontoState as PunchState | null;

  // Guard P6: jornada não iniciada
  if (!ps?.entrada) return;

  // Guard P7: jornada encerrada
  if (ps?.saida) {
    await chrome.alarms.clear(RECHECK_ALARM);
    await chrome.storage.local.remove([...STORAGE_KEYS]);
    return;
  }

  // Guard P3: slot já batido
  if (ps[slot]) return;

  // Salva keys ANTES de abrir janela (P1.4, P1.5)
  await chrome.storage.local.set({ punchPopupSlot: slot, punchPopupExpectedTime: expectedTime });

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

  await openPopupWindow(slot, expectedTime);
  await scheduleRecheck();
}

export async function recheckReminder(): Promise<void> {
  const data = await chrome.storage.local.get([
    'pontoState',
    'punchPopupSlot',
    'punchPopupWindowId',
    'punchPopupExpectedTime',
  ]);

  const ps = data.pontoState as PunchState | null;
  const slot = data.punchPopupSlot as PunchReminderSlot | null;
  const expectedTime = (data.punchPopupExpectedTime as string | null) ?? '';

  if (!slot) return;

  // Guard P6: sem entrada registrada
  if (!ps?.entrada) {
    await resolveReminder(slot);
    return;
  }

  // Guard P7: jornada encerrada
  if (ps?.saida) {
    await resolveReminder(slot);
    return;
  }

  // Slot já batido?
  if (ps[slot]) {
    await resolveReminder(slot);
    return;
  }

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

  // Reabre popup e reagenda (P2)
  await openPopupWindow(slot, expectedTime);
  await scheduleRecheck();
}

export async function resolveReminder(slot: PunchReminderSlot): Promise<void> {
  const data = await chrome.storage.local.get(['punchPopupSlot', 'punchPopupWindowId']);
  const currentSlot = data.punchPopupSlot as PunchReminderSlot | null;

  // Só resolve se for o slot correto (P3/P5)
  if (currentSlot && currentSlot !== slot) return;

  await chrome.alarms.clear(RECHECK_ALARM);

  const windowId = data.punchPopupWindowId as number | undefined;
  if (windowId != null) {
    try {
      await chrome.windows.remove(windowId);
    } catch {
      // Janela já fechada — ignorar
    }
  }

  await chrome.storage.local.remove([...STORAGE_KEYS]);
}

async function openPopupWindow(slot: PunchReminderSlot, expectedTime: string): Promise<void> {
  const base = chrome.runtime.getURL('punch-reminder.html');
  const url = `${base}?slot=${slot}&time=${encodeURIComponent(expectedTime)}`;
  const win = await chrome.windows.create({ url, type: 'popup', width: 420, height: 220, focused: true });
  if (win.id != null) {
    await chrome.storage.local.set({ punchPopupWindowId: win.id });
  }
}

async function scheduleRecheck(): Promise<void> {
  await chrome.alarms.clear(RECHECK_ALARM);
  chrome.alarms.create(RECHECK_ALARM, { delayInMinutes: 5 });
}
