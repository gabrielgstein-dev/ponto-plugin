import type { GpAuthData } from '../../../domain/types';
import { GP_API_BASE, GP_CACHE_DURATION_MS } from './constants';
import { SENIOR_TOKEN_MAX_AGE_MS } from '../../senior/constants';
import { SeniorCookieAuth } from '../../senior/senior-cookie-auth';
import { SeniorPageAuth } from '../../senior/senior-page-auth';
import { refreshSeniorTokenSilently } from '../../senior/senior-token-refresh';
import { debugLog, debugWarn } from '../../../domain/debug';

export async function getGpAssertion(force = false): Promise<GpAuthData | null> {
  const stored = await chrome.storage.local.get(['gpAssertion', 'gpAssertionTs', 'gestaoPontoColaboradorId', 'gestaoPontoCodigoCalculo']);
  if (!force && stored.gpAssertion && stored.gpAssertionTs && Date.now() - stored.gpAssertionTs < GP_CACHE_DURATION_MS && stored.gestaoPontoCodigoCalculo) {
    debugLog('GP auth: usando cache (colab:', stored.gestaoPontoColaboradorId, 'calc:', stored.gestaoPontoCodigoCalculo, ')');
    return { assertion: stored.gpAssertion, colaboradorId: stored.gestaoPontoColaboradorId, codigoCalculo: stored.gestaoPontoCodigoCalculo };
  }
  if (stored.gpAssertion && !stored.gestaoPontoCodigoCalculo) {
    debugLog('GP auth: cache sem codigoCalculo, re-autenticando...');
  }

  const accessToken = await getSeniorAccessToken();
  if (!accessToken) {
    debugLog('GP auth: sem access_token do cookie');
    return null;
  }
  debugLog('GP auth: access_token obtido, autenticando com GP...');

  // 1ª tentativa com o token corrente
  const first = await callGpAuthG7(accessToken);
  if (first.ok) return first.data;

  // BUG 2: ao receber 401/403, NÃO invalida seniorToken do storage. O storage
  // é fallback do cookie — se o cookie expirou, deletar storage só piora.
  // Em vez disso, tenta refresh silencioso (sem threshold de 12h) e re-faz a
  // chamada uma única vez. Se ainda assim falhar, devolve null em silêncio
  // — o sidepanel vai detectar e mostrar UI de "Reconectar" pro usuário.
  if (first.shouldRefresh) {
    debugLog('GP auth: 401/403 — tentando refresh silencioso forçado...');
    const refreshed = await refreshSeniorTokenSilently({ force: true });
    if (refreshed) {
      const second = await callGpAuthG7(refreshed);
      if (second.ok) return second.data;
    }
  }
  return null;
}

interface CallGpAuthResult {
  ok: boolean;
  data: GpAuthData | null;
  shouldRefresh: boolean;
}

async function callGpAuthG7(accessToken: string): Promise<CallGpAuthResult> {
  try {
    const r = await fetch(`${GP_API_BASE}senior/auth/g7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*', 'token': accessToken, 'expires': '604800' },
      body: '{}',
    });
    if (!r.ok) {
      debugWarn('GP auth/g7 falhou:', r.status);
      const shouldRefresh = r.status === 401 || r.status === 403;
      return { ok: false, data: null, shouldRefresh };
    }
    const json = await r.json();
    if (!json.token) {
      debugWarn('GP auth/g7: resposta sem token');
      return { ok: false, data: null, shouldRefresh: false };
    }

    const colaboradorId = json.colaborador?.id ?? null;
    const codigoCalculo = extractCodigoCalculo(json);
    const save: Record<string, unknown> = { gpAssertion: json.token, gpAssertionTs: Date.now() };
    if (colaboradorId) save.gestaoPontoColaboradorId = colaboradorId;
    if (codigoCalculo) save.gestaoPontoCodigoCalculo = codigoCalculo;
    chrome.storage.local.set(save);
    debugLog('GP auth/g7 OK, colaboradorId:', colaboradorId, 'codigoCalculo:', codigoCalculo, 'userRange:', JSON.stringify(json.userRange)?.substring(0, 200));
    return { ok: true, data: { assertion: json.token, colaboradorId, codigoCalculo }, shouldRefresh: false };
  } catch (e) {
    debugWarn('GP auth/g7 erro:', (e as Error).message);
    return { ok: false, data: null, shouldRefresh: false };
  }
}

async function getSeniorAccessToken(): Promise<string | null> {
  const fromCookie = await new SeniorCookieAuth().getAccessToken();
  if (fromCookie) return fromCookie;

  const fromPage = await new SeniorPageAuth().getAccessToken();
  if (fromPage) {
    debugLog('getSeniorAccessToken: token obtido via aba Senior aberta');
    return fromPage;
  }

  debugLog('getSeniorAccessToken: cookie não encontrado, tentando storage...');
  try {
    const stored = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
    if (stored.seniorToken && stored.seniorTokenTs && Date.now() - stored.seniorTokenTs < SENIOR_TOKEN_MAX_AGE_MS) {
      debugLog('getSeniorAccessToken: usando seniorToken do storage (age:', Math.round((Date.now() - stored.seniorTokenTs) / 3600000), 'h)');
      return stored.seniorToken;
    }
    if (stored.seniorToken) {
      // Token expirado — tenta refresh silencioso antes de desistir
      debugLog('getSeniorAccessToken: seniorToken expirado, tentando refresh silencioso...');
      const refreshed = await refreshSeniorTokenSilently();
      if (refreshed) return refreshed;
    }
  } catch (e) {
    debugWarn('getSeniorAccessToken: erro ao ler storage:', (e as Error).message);
  }

  debugLog('getSeniorAccessToken: nenhuma fonte de token disponível');
  return null;
}

export function invalidateGpCache(): void {
  chrome.storage.local.remove(['gpAssertion', 'gpAssertionTs']);
}

export async function invalidateSeniorTokenStorage(): Promise<void> {
  await chrome.storage.local.remove(['seniorToken', 'seniorTokenTs']);
  debugLog('seniorToken invalidado no storage (401/403 do Senior)');
}

function extractCodigoCalculo(json: Record<string, unknown>): string | null {
  const userRange = json.userRange as Array<Record<string, string>> | undefined;
  if (!Array.isArray(userRange)) return null;
  for (const entry of userRange) {
    const condition = entry.condition || entry.Condition || JSON.stringify(entry);
    const match = condition.match(/CodCal[=:]\s*\d+[-\u2013]?(\d+)/);
    if (match) return match[1];
  }
  return null;
}
