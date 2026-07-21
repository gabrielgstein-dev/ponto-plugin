import type { PunchResult } from '../domain/types';
import { auditLog } from '../domain/debug';
import { timeToMinutes } from '../domain/time-utils';
import { registerPunch } from './register-punch';
import { SeniorCookieAuth } from '../infrastructure/senior/senior-cookie-auth';
import { SeniorPageAuth } from '../infrastructure/senior/senior-page-auth';
import { SeniorInterceptorAuth } from '../infrastructure/senior/senior-interceptor-auth';
import { SeniorPunchRegistrar } from '../infrastructure/senior/senior-registrar';
import {
  SeniorActiveUserPunchProvider,
  resetSeniorActiveUserCache,
} from '../infrastructure/senior/senior-active-user-provider';

// Mesma cadeia de auth do botão manual (usePunchAction). Rodar no service worker
// é ok: SeniorCookieAuth usa chrome.cookies; os demais são fallback via aba.
const authProviders = [
  new SeniorCookieAuth(),
  new SeniorPageAuth(),
  new SeniorInterceptorAuth(),
];

const registrar = new SeniorPunchRegistrar();

// Provider de SERVIDOR (query clockingEventByActiveUserQuery). Deliberadamente
// NÃO usamos o provider de localStorage aqui: o caminho manual injeta a batida
// no `clockingEventsStorage` da aba, e o detector lê essa mesma chave — usar
// isso como confirmação seria o plugin lendo a própria escrita e "provando"
// uma batida que o Senior nunca registrou.
const verifyProvider = new SeniorActiveUserPunchProvider();

// Re-consulta o servidor algumas vezes: o evento pode levar alguns segundos
// para aparecer na query após o import.
const VERIFY_DELAYS_MS = [0, 3000, 8000];

// Tolerância no match: o servidor pode registrar o evento no minuto seguinte
// ao que devolveu no corpo.
const VERIFY_TOLERANCE_MIN = 1;

export interface AutoPunchResult extends PunchResult {
  /** Horário HH:MM que o Senior devolveu no corpo do import. */
  punchTime: string | null;
  /** O servidor, consultado de forma independente, confirma a batida? */
  confirmed: boolean;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Confirma a batida lendo do SERVIDOR (não do localStorage). É o que separa
 * "o POST voltou 200" de "o ponto existe no Senior".
 */
async function verifyOnServer(punchTime: string): Promise<boolean> {
  const targetMin = timeToMinutes(punchTime);
  if (targetMin == null) return false;

  for (const delay of VERIFY_DELAYS_MS) {
    if (delay) await sleep(delay);
    resetSeniorActiveUserCache();
    try {
      const times = await verifyProvider.fetchPunches(new Date(), false);
      const hit = times.some(t => {
        const m = timeToMinutes(t);
        return m != null && Math.abs(m - targetMin) <= VERIFY_TOLERANCE_MIN;
      });
      if (hit) {
        auditLog(`Auto-punch: confirmado no servidor (${punchTime} presente em [${times.join(', ')}])`);
        return true;
      }
      auditLog(`Auto-punch: ainda não confirmado após ${delay}ms — servidor tem [${times.join(', ')}]`);
    } catch (e) {
      auditLog(`Auto-punch: verificação falhou após ${delay}ms: ${(e as Error).message}`);
    }
  }
  return false;
}

/**
 * Executa a batida automática no Senior.
 *
 * Contrato: só reporta `success: true` quando o Senior devolveu o evento
 * importado E uma leitura independente do servidor enxerga a batida. Qualquer
 * coisa aquém disso é falha ou "não confirmado" — nunca um sucesso otimista.
 *
 * Diferente do botão manual, NÃO injeta no localStorage da aba: com ninguém
 * olhando, uma escrita local vira "prova" falsa na próxima detecção.
 */
export async function runAutoPunch(): Promise<AutoPunchResult> {
  const result = await registerPunch(authProviders, registrar);
  if (!result.success) {
    return { ...result, punchTime: null, confirmed: false };
  }

  let punchTime: string | null = null;
  try {
    const body = typeof result.responseBody === 'string'
      ? JSON.parse(result.responseBody)
      : result.responseBody;
    const ev = body?.clockingResult?.clockingEventImported;
    if (ev?.timeEvent) {
      const m = ev.timeEvent.match(/(\d{2}):(\d{2})/);
      if (m) punchTime = `${m[1]}:${m[2]}`;
    }
  } catch (_) { /* corpo sem horário */ }

  if (!punchTime) {
    // O registrar já exige clockingEventImported para retornar success, então
    // chegar aqui significa corpo truncado/inesperado. Sem horário não há como
    // confirmar — trata como falha em vez de inventar o relógio atual.
    return {
      success: false,
      logs: [...result.logs, 'import sem timeEvent legível — sem como confirmar'],
      punchTime: null,
      confirmed: false,
    };
  }

  const confirmed = await verifyOnServer(punchTime);

  if (confirmed) {
    // Só agora publicamos o sucesso. punchSuccessTs dispara re-detecção no
    // background.ts; com a batida já no servidor, a detecção lê a verdade.
    await chrome.storage.local.set({
      punchSuccessTs: Date.now(),
      punchSuccessTime: punchTime,
    });
  }

  return { ...result, punchTime, confirmed };
}
