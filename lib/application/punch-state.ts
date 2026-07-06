import type { PunchReminderSlot, PunchState } from '../domain/types';

/**
 * Fonte única da verdade pra "esse slot já foi batido hoje?".
 *
 * Todo caminho que decide suprimir/disparar um lembrete (notif_*, reminder_*,
 * punch_popup_* e o recheck) DEVE passar por aqui — nunca ler `pontoState[slot]`
 * direto do storage. Motivos:
 *
 * 1. `pontoState` sem validar `pontoDate` pode ser de ONTEM (reset diário
 *    perdido com a máquina desligada na virada). Estado de ontem com saida
 *    preenchida suprimiria todos os lembretes de hoje.
 * 2. A checagem é por existência de valor no slot (truthy), nunca por
 *    comparação de horário — batimento adiantado (08:17 numa entrada 08:30)
 *    conta como batido.
 */

/** `pontoState` validado contra `pontoDate` — null se o estado não é de hoje. */
export function punchStateForToday(data: {
  pontoState?: PunchState | null;
  pontoDate?: string;
}): PunchState | null {
  if (data.pontoDate !== new Date().toDateString()) return null;
  return data.pontoState ?? null;
}

/** Checagem pura, pra quem já tem um `PunchState` validado em mãos. */
export function isSlotPunched(ps: PunchState | null | undefined, slot: PunchReminderSlot): boolean {
  return !!ps?.[slot];
}

/** Lê o storage e devolve o estado de HOJE (null se ausente ou de outro dia). */
export async function getTodayPunchState(): Promise<PunchState | null> {
  const data = await chrome.storage.local.get(['pontoState', 'pontoDate']);
  return punchStateForToday(data as { pontoState?: PunchState | null; pontoDate?: string });
}

/** Conveniência: lê o storage e responde se o slot já foi batido hoje. */
export async function isSlotPunchedToday(slot: PunchReminderSlot): Promise<boolean> {
  return isSlotPunched(await getTodayPunchState(), slot);
}
