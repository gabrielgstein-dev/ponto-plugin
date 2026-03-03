import type { GpAuthData } from '../../../domain/types';
import { GP_API_BASE, GP_CACHE_DURATION_MS } from './constants';
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

  try {
    const r = await fetch(`${GP_API_BASE}senior/auth/g7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*', 'token': accessToken, 'expires': '604800' },
      body: '{}',
    });
    if (!r.ok) {
      debugWarn('GP auth/g7 falhou:', r.status);
      return null;
    }
    const json = await r.json();
    if (!json.token) {
      debugWarn('GP auth/g7: resposta sem token');
      return null;
    }

    const colaboradorId = json.colaborador?.id ?? null;
    const codigoCalculo = extractCodigoCalculo(json);
    const save: Record<string, unknown> = { gpAssertion: json.token, gpAssertionTs: Date.now() };
    if (colaboradorId) save.gestaoPontoColaboradorId = colaboradorId;
    if (codigoCalculo) save.gestaoPontoCodigoCalculo = codigoCalculo;
    chrome.storage.local.set(save);
    debugLog('GP auth/g7 OK, colaboradorId:', colaboradorId, 'codigoCalculo:', codigoCalculo, 'userRange:', JSON.stringify(json.userRange)?.substring(0, 200));
    return { assertion: json.token, colaboradorId, codigoCalculo };
  } catch (e) {
    debugWarn('GP auth/g7 erro:', (e as Error).message);
    return null;
  }
}

const TOKEN_MAX_AGE_MS = 60 * 60000;

async function getSeniorAccessToken(): Promise<string | null> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.senior.com.br', name: 'com.senior.token' });
    if (cookies.length) {
      const tokenObj = JSON.parse(decodeURIComponent(cookies[0].value));
      const token = tokenObj.access_token || null;
      if (token) {
        debugLog('Cookie com.senior.token: access_token encontrado');
        return token;
      }
    }
    debugLog('Cookie com.senior.token NAO encontrado, tentando storage...');
  } catch (e) {
    debugWarn('Erro ao ler cookie:', (e as Error).message);
  }

  try {
    const stored = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
    if (stored.seniorToken && stored.seniorTokenTs && Date.now() - stored.seniorTokenTs < TOKEN_MAX_AGE_MS) {
      debugLog('getSeniorAccessToken: usando seniorToken do storage (age:', Math.round((Date.now() - stored.seniorTokenTs) / 1000), 's)');
      return stored.seniorToken;
    }
    if (stored.seniorToken) debugLog('getSeniorAccessToken: seniorToken expirado');
  } catch (e) {
    debugWarn('Erro ao ler seniorToken do storage:', (e as Error).message);
  }

  debugLog('getSeniorAccessToken: nenhuma fonte de token disponível');
  return null;
}

export function invalidateGpCache(): void {
  chrome.storage.local.remove(['gpAssertion', 'gpAssertionTs']);
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
