/**
 * Helpers de navegação dentro do slot do side panel do Chrome.
 *
 * Chrome só permite 1 sidepanel visível por janela, e quando o painel já
 * está aberto, chamar chrome.sidePanel.open() é no-op — não tem como
 * "trocar" o conteúdo via API.
 *
 * Estratégia híbrida:
 * - Mensagem pra página do sidepanel (se aberta): ela navega via
 *   window.location.href, que troca o conteúdo na hora.
 * - setOptions + open como fallback: se o painel estava fechado, abre direto
 *   na página alvo. Se já estava aberto, open() é no-op (mensagem já
 *   resolveu).
 *
 * Sempre resetamos o default pra sidepanel.html no fim, pra que próximas
 * aberturas (toolbar, HourBankBanner, etc) abram no main por padrão.
 *
 * Importante: chamar SEMPRE direto do click handler. open() exige user
 * gesture; awaits e mensagens consomem o gesture, mas como open() pode ser
 * no-op (painel aberto), o gesture nem é necessário nesse caso.
 */
const SETTINGS_PATH = 'settings.html';
const MAIN_PATH = 'sidepanel.html';

export const NAV_MSG_TO_SETTINGS = 'NAVIGATE_SIDEPANEL_TO_SETTINGS';
export const NAV_MSG_TO_MAIN = 'NAVIGATE_SIDEPANEL_TO_MAIN';

export async function openSettingsSidePanel(): Promise<void> {
  chrome.runtime.sendMessage({ type: NAV_MSG_TO_SETTINGS }).catch(() => {});

  const win = await chrome.windows.getCurrent();
  if (win.id == null) return;
  await chrome.sidePanel.setOptions({ path: SETTINGS_PATH, enabled: true });
  await chrome.sidePanel.open({ windowId: win.id });
}

export async function openMainSidePanel(targetTab?: 'ponto' | 'timesheet'): Promise<void> {
  if (targetTab) {
    await chrome.storage.local.set({ sidePanelTab: targetTab });
  }
  chrome.runtime.sendMessage({ type: NAV_MSG_TO_MAIN }).catch(() => {});

  const win = await chrome.windows.getCurrent();
  if (win.id == null) return;
  await chrome.sidePanel.setOptions({ path: MAIN_PATH, enabled: true });
  await chrome.sidePanel.open({ windowId: win.id });
}

export function navigateToSettings(): void {
  window.location.href = chrome.runtime.getURL(SETTINGS_PATH);
}

export async function navigateToMain(targetTab?: 'ponto' | 'timesheet'): Promise<void> {
  if (targetTab) {
    await chrome.storage.local.set({ sidePanelTab: targetTab });
  }
  window.location.href = chrome.runtime.getURL(MAIN_PATH);
}
