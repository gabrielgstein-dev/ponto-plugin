/**
 * Refresh silencioso de tokens Senior.
 *
 * Contrato real (POC validada em produção):
 *   POST .../platform/authentication/actions/refreshToken
 *   Body:  { "refreshToken": "<opaque>" }
 *   200:   { "jsonToken": "<string JSON escapada>" }
 *          jsonToken contém { access_token, refresh_token, expires_in, ... }
 *
 * O refresh_token é rotacionado a cada chamada — sempre persistir o novo.
 *
 * Proteções:
 *   - Timeout de 5s no fetch (evita travamento)
 *   - Single-flight lock (Promise compartilhada — múltiplos callers paralelos
 *     aguardam a mesma resposta em vez de disparar refreshes em loop)
 *   - Circuit breaker: 3 falhas em <30s suspende refresh por 5min
 *   - Feature flag ENABLE_SILENT_REFRESH gate (default off em produção)
 *
 * Atrás da feature flag enquanto não validamos em produção. Quando o
 * usuário liga o flag, o refresh roda; senão, função vira no-op (retorna
 * null como antes do PR-17, sem efeito colateral).
 */
import { SENIOR_API_BASE } from './constants';
import { ENABLE_SILENT_REFRESH } from '../../domain/build-flags';
import { debugLog } from '../../domain/debug';
import { logError } from '../../domain/error-logger';
import { fetchWithTimeout } from '../../domain/fetch-utils';

const REFRESH_ENDPOINT = `${SENIOR_API_BASE}/platform/authentication/actions/refreshToken`;
const REFRESH_TIMEOUT_MS = 5000;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_FAILURE_WINDOW_MS = 30_000;
const CIRCUIT_OPEN_DURATION_MS = 5 * 60_000;

interface SeniorTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

let inflightRefresh: Promise<string | null> | null = null;
const failureTimestamps: number[] = [];
let circuitOpenUntil = 0;

export async function persistSeniorTokens(tokens: SeniorTokenSet): Promise<void> {
  const save: Record<string, unknown> = {
    seniorToken: tokens.access_token,
    seniorTokenTs: Date.now(),
  };
  if (tokens.refresh_token) save.seniorRefreshToken = tokens.refresh_token;
  if (typeof tokens.expires_in === 'number') save.seniorTokenExpiresIn = tokens.expires_in;
  await chrome.storage.local.set(save);
  debugLog('Senior: tokens persistidos no storage');
}

export async function refreshSeniorTokenSilently(_opts: { force?: boolean } = {}): Promise<string | null> {
  if (!ENABLE_SILENT_REFRESH) {
    debugLog('Senior refresh: ENABLE_SILENT_REFRESH=false, no-op');
    return null;
  }

  // Circuit breaker: se acabou de falhar muito, suspende
  if (Date.now() < circuitOpenUntil) {
    debugLog(`Senior refresh: circuito aberto até ${new Date(circuitOpenUntil).toISOString()}, pulando`);
    return null;
  }

  // Single-flight: callers paralelos compartilham a mesma Promise
  if (inflightRefresh) {
    debugLog('Senior refresh: refresh já em curso, aguardando o existente');
    return inflightRefresh;
  }

  inflightRefresh = doRefresh().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

async function doRefresh(): Promise<string | null> {
  const stored = await chrome.storage.local.get(['seniorRefreshToken']);
  const refreshToken = stored.seniorRefreshToken as string | undefined;
  if (!refreshToken) {
    debugLog('Senior refresh: sem refresh_token no storage');
    return null;
  }

  try {
    debugLog('Senior refresh: tentando renovar...');
    const r = await fetchWithTimeout(REFRESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      timeoutMs: REFRESH_TIMEOUT_MS,
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      logError(new Error(`refresh endpoint returned ${r.status}`), {
        category: 'auth',
        severity: 'high',
        operation: 'refreshSeniorTokenSilently',
        metadata: { status: r.status, bodyPreview: body.substring(0, 200) },
      });
      recordFailure();
      return null;
    }

    const json = await r.json();
    const inner = parseJsonToken(json);
    if (!inner?.access_token) {
      logError(new Error('refresh response missing access_token'), {
        category: 'auth',
        severity: 'high',
        operation: 'refreshSeniorTokenSilently',
        metadata: { responseKeys: Object.keys(json ?? {}) },
      });
      recordFailure();
      return null;
    }

    await persistSeniorTokens({
      access_token: inner.access_token,
      refresh_token: inner.refresh_token,
      expires_in: inner.expires_in,
    });
    resetCircuit();
    debugLog('Senior refresh: token renovado com sucesso');
    return inner.access_token;
  } catch (e) {
    logError(e, {
      category: 'auth',
      severity: 'high',
      operation: 'refreshSeniorTokenSilently',
      metadata: { isTimeout: (e as { name?: string })?.name === 'FetchTimeoutError' },
    });
    recordFailure();
    return null;
  }
}

function recordFailure(): void {
  const now = Date.now();
  failureTimestamps.push(now);
  // Mantém só falhas dentro da janela
  while (failureTimestamps.length > 0 && now - failureTimestamps[0] > CIRCUIT_FAILURE_WINDOW_MS) {
    failureTimestamps.shift();
  }
  if (failureTimestamps.length >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = now + CIRCUIT_OPEN_DURATION_MS;
    failureTimestamps.length = 0;
    debugLog(`Senior refresh: circuito aberto por ${CIRCUIT_OPEN_DURATION_MS / 60_000}min após ${CIRCUIT_FAILURE_THRESHOLD} falhas`);
  }
}

function resetCircuit(): void {
  failureTimestamps.length = 0;
  circuitOpenUntil = 0;
}

interface JsonTokenInner {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

function parseJsonToken(json: unknown): JsonTokenInner | null {
  if (!json || typeof json !== 'object') return null;
  const wrap = json as { jsonToken?: unknown };
  if (typeof wrap.jsonToken === 'string') {
    try { return JSON.parse(wrap.jsonToken) as JsonTokenInner; } catch { return null; }
  }
  if (typeof wrap.jsonToken === 'object' && wrap.jsonToken !== null) {
    return wrap.jsonToken as JsonTokenInner;
  }
  return null;
}

/* v8 ignore next 5 -- helpers só pra testes */
export function _resetForTests(): void {
  inflightRefresh = null;
  failureTimestamps.length = 0;
  circuitOpenUntil = 0;
}
