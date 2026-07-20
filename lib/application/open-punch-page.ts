import { COMPANY_PUNCH_URL } from '#company/providers';

/**
 * Abre (ou foca, se já aberta) a página de batida de ponto do Senior.
 * Compartilhado entre o handler da mensagem OPEN_PUNCH_PAGE (background.ts) e o
 * fallback do auto-punch (handle-alarm.ts).
 */
export async function openPunchPage(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://platform.senior.com.br/*' });
  const existing = tabs.find(t => t.url?.includes('clockingEvent') || t.url?.includes('clocking-event'));
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: COMPANY_PUNCH_URL, active: true });
}
