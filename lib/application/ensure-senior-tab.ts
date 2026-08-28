import { COMPANY_PUNCH_URL } from '#company/providers';
import { findSeniorTab } from '../infrastructure/senior/tab-utils';
import { auditLog } from '../domain/debug';

/**
 * Tempo máximo esperando o `status: 'complete'` da aba. Só cobre o carregamento
 * do documento — a SPA ainda vai bootar depois disso.
 */
const LOAD_TIMEOUT_MS = 20000;

/**
 * Tempo máximo esperando a SPA bootar e autenticar (= algum provider da cadeia
 * conseguir resolver um token). O boot do Senior X não é instantâneo: o
 * documento completa, a SPA sobe, e só então dispara os requests autenticados
 * que realimentam `seniorToken` (webRequest do background), `seniorBearerToken`
 * (content script) e o sessionStorage que o SeniorPageAuth lê.
 */
const READY_TIMEOUT_MS = 30000;

const POLL_INTERVAL_MS = 500;

/** Heurística de "caiu na tela de login" — abrir aba não cria sessão. */
const LOGIN_URL_RE = /\/(login|signin|auth\/realms|oauth)/i;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export interface SeniorTabHandle {
  tabId: number;
  /** Fomos NÓS que abrimos? Só fechamos o que abrimos. */
  opened: boolean;
}

/**
 * Garante uma aba Senior utilizável antes da batida automática.
 *
 * Motivação (log de 2026-07-21): o auto-punch das 09:43 morreu em 20ms com
 * "Nenhum token encontrado" logo após um startup do Chrome — sem aba Senior,
 * `SeniorPageAuth` volta null na hora e o `SeniorPunchRegistrar` nem teria onde
 * injetar o fetch (ele roda no contexto da página, ver senior-registrar.ts).
 *
 * Abre em BACKGROUND (`active: false`) de propósito: o disparo é no meio do
 * expediente e roubar o foco do usuário é pior que a falha que estamos
 * consertando.
 *
 * Retorna `null` quando não conseguiu uma aba pronta — inclusive no caso
 * "sessão morta, caiu no login". O chamador deve tratar isso como falha normal
 * e cair no fallback visível (notificação + openPunchPage + lembrete), porque
 * esse cenário exige o humano.
 *
 * @param isReady sonda de prontidão — tipicamente "a cadeia de auth resolve um
 *                token?". Injetada para manter este módulo testável e sem
 *                dependência da infraestrutura de auth.
 */
export async function ensureSeniorTab(
  isReady: () => Promise<boolean>,
): Promise<SeniorTabHandle | null> {
  const existing = await findSeniorTab();
  if (existing?.id != null) {
    return { tabId: existing.id, opened: false };
  }

  auditLog('Auto-punch: nenhuma aba Senior aberta — abrindo em background...');

  let tabId: number;
  try {
    const tab = await chrome.tabs.create({ url: COMPANY_PUNCH_URL, active: false });
    if (tab?.id == null) {
      auditLog('Auto-punch: chrome.tabs.create não devolveu id — abortando');
      return null;
    }
    tabId = tab.id;
  } catch (e) {
    auditLog(`Auto-punch: falha ao abrir aba Senior: ${(e as Error).message}`);
    return null;
  }

  const handle: SeniorTabHandle = { tabId, opened: true };

  if (!await waitForLoad(tabId)) {
    auditLog(`Auto-punch: aba Senior não carregou em ${LOAD_TIMEOUT_MS / 1000}s — desistindo`);
    await closeSeniorTab(handle);
    return null;
  }

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isReady().catch(() => false)) {
      auditLog('Auto-punch: aba Senior aberta e autenticada');
      return handle;
    }
    if (await isAtLogin(tabId)) {
      auditLog('Auto-punch: aba Senior caiu na tela de LOGIN — sessão expirada, precisa de login manual');
      await closeSeniorTab(handle);
      return null;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  auditLog(`Auto-punch: aba Senior abriu mas não autenticou em ${READY_TIMEOUT_MS / 1000}s`);
  await closeSeniorTab(handle);
  return null;
}

/** Fecha a aba SÓ se fomos nós que abrimos — nunca fecha aba do usuário. */
export async function closeSeniorTab(handle: SeniorTabHandle | null): Promise<void> {
  if (!handle?.opened) return;
  try {
    await chrome.tabs.remove(handle.tabId);
  } catch (_) { /* aba já fechada pelo usuário: nada a fazer */ }
}

async function waitForLoad(tabId: number): Promise<boolean> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.status === 'complete') return true;
    } catch (_) {
      return false; // aba sumiu (fechada pelo usuário / crash)
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function isAtLogin(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return !!tab?.url && LOGIN_URL_RE.test(tab.url);
  } catch (_) {
    return false;
  }
}
