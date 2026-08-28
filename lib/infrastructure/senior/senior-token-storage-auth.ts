import type { IAuthProvider } from '../../domain/interfaces';
import { SENIOR_TOKEN_MAX_AGE_MS } from './constants';

/**
 * Lê o Bearer que o `webRequest.onSendHeaders` do background captura da SPA
 * Senior (chave `seniorToken`, ver entrypoints/background.ts).
 *
 * Por que existe, separado do SeniorInterceptorAuth: eram DOIS universos de
 * token que nunca se falavam. A detecção resolvia por `seniorToken` (TTL 6,5d
 * + refresh silencioso via `seniorRefreshToken`) e funcionava; a batida só
 * conhecia `seniorBearerToken` — escrito apenas pelo content script, TTL 60min,
 * zerado toda meia-noite pelo handleDailyReset. Resultado observado em
 * 2026-07-21 09:43: `seniorToken` fresco no storage (age=10m) e a batida
 * morrendo com "Nenhum token encontrado".
 *
 * Fica por ÚLTIMO na cadeia: é o token de escopo mais amplo e o menos
 * "provado" para o endpoint de import (o log só prova ele em query). Os
 * providers acima continuam preferidos quando disponíveis.
 */
export class SeniorTokenStorageAuth implements IAuthProvider {
  readonly name = 'tokenStorage';

  async getAccessToken(): Promise<string | null> {
    const stored = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
    if (!stored.seniorToken || !stored.seniorTokenTs) return null;

    const age = Date.now() - (stored.seniorTokenTs as number);
    if (age >= SENIOR_TOKEN_MAX_AGE_MS) return null;

    return stored.seniorToken as string;
  }
}
