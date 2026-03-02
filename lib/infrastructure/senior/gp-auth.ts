import type { GpAuthData } from '../../domain/types';
import { GP_API_BASE, GP_CACHE_DURATION_MS } from './constants';

export async function getGpAssertion(): Promise<GpAuthData | null> {
  const stored = await chrome.storage.local.get(['gpAssertion', 'gpAssertionTs', 'gestaoPontoColaboradorId', 'gestaoPontoCodigoCalculo']);
  if (stored.gpAssertion && stored.gpAssertionTs && Date.now() - stored.gpAssertionTs < GP_CACHE_DURATION_MS && stored.gestaoPontoCodigoCalculo) {
    console.log('[Senior Ponto] GP auth: usando cache (colab:', stored.gestaoPontoColaboradorId, 'calc:', stored.gestaoPontoCodigoCalculo, ')');
    return { assertion: stored.gpAssertion, colaboradorId: stored.gestaoPontoColaboradorId, codigoCalculo: stored.gestaoPontoCodigoCalculo };
  }
  if (stored.gpAssertion && !stored.gestaoPontoCodigoCalculo) {
    console.log('[Senior Ponto] GP auth: cache sem codigoCalculo, re-autenticando...');
  }

  const accessToken = await getSeniorAccessToken();
  if (!accessToken) {
    console.log('[Senior Ponto] GP auth: sem access_token do cookie');
    return null;
  }
  console.log('[Senior Ponto] GP auth: access_token obtido, autenticando com GP...');

  try {
    const r = await fetch(`${GP_API_BASE}senior/auth/g7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*', 'token': accessToken, 'expires': '604800' },
      body: '{}',
    });
    if (!r.ok) {
      console.warn('[Senior Ponto] GP auth/g7 falhou:', r.status);
      return null;
    }
    const json = await r.json();
    if (!json.token) {
      console.warn('[Senior Ponto] GP auth/g7: resposta sem token');
      return null;
    }

    const colaboradorId = json.colaborador?.id ?? null;
    const codigoCalculo = extractCodigoCalculo(json);
    const save: Record<string, unknown> = { gpAssertion: json.token, gpAssertionTs: Date.now() };
    if (colaboradorId) save.gestaoPontoColaboradorId = colaboradorId;
    if (codigoCalculo) save.gestaoPontoCodigoCalculo = codigoCalculo;
    chrome.storage.local.set(save);
    console.log('[Senior Ponto] GP auth/g7 OK, colaboradorId:', colaboradorId, 'codigoCalculo:', codigoCalculo, 'userRange:', JSON.stringify(json.userRange)?.substring(0, 200));
    return { assertion: json.token, colaboradorId, codigoCalculo };
  } catch (e) {
    console.warn('[Senior Ponto] GP auth/g7 erro:', (e as Error).message);
    return null;
  }
}

async function getSeniorAccessToken(): Promise<string | null> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.senior.com.br', name: 'com.senior.token' });
    if (!cookies.length) {
      console.log('[Senior Ponto] Cookie com.senior.token NAO encontrado');
      return null;
    }
    const tokenObj = JSON.parse(decodeURIComponent(cookies[0].value));
    const token = tokenObj.access_token || null;
    console.log('[Senior Ponto] Cookie com.senior.token:', token ? 'access_token encontrado' : 'sem access_token');
    return token;
  } catch (e) {
    console.warn('[Senior Ponto] Erro ao ler cookie:', (e as Error).message);
    return null;
  }
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
