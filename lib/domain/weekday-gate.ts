import { DEFAULT_SETTINGS, type Settings } from './types';
import { isWeekend } from './time-utils';

/**
 * Lê `pontoSettings.weekdaysOnly` direto do storage e cruza com `isWeekend()`.
 *
 * Por que ler do storage em vez de usar `settings` em memória: o service worker
 * MV3 hiberna após 30s ociosos. Quando um alarm dispara e o SW reinicia, o
 * objeto `settings` (state.ts) volta a `DEFAULT_SETTINGS` — só é re-hidratado
 * por `backgroundDetect`/`handleDailyReset`. Os fire handlers de alarm podem
 * rodar ANTES dessa re-hidratação, então `settings.weekdaysOnly` lê stale.
 *
 * Ler do storage garante a flag certa em qualquer ciclo do SW.
 */
export async function isReminderBlockedToday(): Promise<boolean> {
  const data = await chrome.storage.local.get('pontoSettings');
  const stored = (data.pontoSettings as Partial<Settings> | null | undefined) ?? {};
  const weekdaysOnly = stored.weekdaysOnly ?? DEFAULT_SETTINGS.weekdaysOnly;
  return weekdaysOnly && isWeekend();
}
