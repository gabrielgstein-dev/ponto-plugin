import type { IPunchProvider } from '../../domain/interfaces';
import { SeniorCookieAuth } from './senior-cookie-auth';
import { SENIOR_TOKEN_MAX_AGE_MS } from './constants';
import { debugLog, debugWarn } from '../../domain/debug';
import { logError } from '../../domain/error-logger';

/**
 * Detecta batimentos via `clockingEventByActiveUserQuery` do service
 * `pontomobile` — fetch DIRETO do service worker, **sem precisar de aba do
 * Senior aberta**.
 *
 * Resolve o cenário em que o user só usa o app mobile do Senior: a SPA web
 * não fica aberta no Chrome → providers que dependem dela (Storage, Api via
 * tab, Scraper) ficam cegos. GP tem o batimento mas com lag (mobile→backend
 * Senior→GP demora minutos). Esse endpoint pega mobile em real-time.
 *
 * Descoberta do schema:
 *   - 2026-05-14: spike confirmou 200 + batimento `platform: android` em
 *     real-time. O Bearer da SPA web tem scope suficiente (diferente dos
 *     endpoints `pontomobile_clocking_event/*` que retornaram 403 sem
 *     permissão `Visualizar`).
 *   - Body shape descoberto via [diegodario88/clockwerk](https://github.com/diegodario88/clockwerk):
 *     `pageInfo` é nested em `filter`, `pageSize` é STRING, `activePlatformUser`
 *     escopa pro user logado.
 *
 * Priority 1 (acima do GP) — esse canal não tem lag pra mobile, então é mais
 * confiável quando ambos têm dados.
 */
const ENDPOINT = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/hcm/pontomobile/queries/clockingEventByActiveUserQuery';

const CACHE_TTL_MS = 30000;
const FAIL_COOLDOWN_MS = 2 * 60 * 1000;

let _cachedTimes: string[] | null = null;
let _cachedTs = 0;
let _lastFailTs = 0;

const cookieAuth = new SeniorCookieAuth();

export function resetSeniorActiveUserCache(): void {
  _cachedTimes = null;
  _cachedTs = 0;
  _lastFailTs = 0;
}

export class SeniorActiveUserPunchProvider implements IPunchProvider {
  readonly name = 'seniorActiveUser';
  readonly priority = 1;

  async fetchPunches(date: Date, _aggressive = false): Promise<string[]> {
    if (Date.now() - _lastFailTs < FAIL_COOLDOWN_MS) return _cachedTimes ?? [];
    if (_cachedTimes && Date.now() - _cachedTs < CACHE_TTL_MS) return _cachedTimes;

    const token = await this.resolveToken();
    if (!token) {
      debugLog('SeniorActiveUser: sem token Senior — pula');
      return [];
    }

    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            activePlatformUser: true,
            pageInfo: { page: 0, pageSize: '50' },
            nameSearch: '',
            sort: { field: null, order: 'ASC' },
          },
        }),
      });

      if (!r.ok) {
        debugWarn(`SeniorActiveUser: HTTP ${r.status} (${r.statusText})`);
        if (r.status === 401 || r.status === 403) {
          // Token expirou/sem scope — cooldown pra não martelar
          _lastFailTs = Date.now();
        }
        return _cachedTimes ?? [];
      }

      const json = (await r.json()) as ClockingResponse;
      const times = parseClockingResponse(json, dateStr(date));
      _cachedTimes = times;
      _cachedTs = Date.now();
      _lastFailTs = 0;
      debugLog(`SeniorActiveUser: ${times.length} batimento(s) hoje: ${times.join(', ')}`);
      return times;
    } catch (e) {
      logError(e, {
        category: 'detection',
        severity: 'high',
        operation: 'SeniorActiveUserPunchProvider.fetchPunches',
      });
      _lastFailTs = Date.now();
      return _cachedTimes ?? [];
    }
  }

  private async resolveToken(): Promise<string | null> {
    // 1. Cookie OAuth (com.senior.token) — preferido, sempre fresco
    const cookieToken = await cookieAuth.getAccessToken().catch(() => null);
    if (cookieToken) return cookieToken;

    // 2. Bearer capturado pelo webRequest interceptor — fallback
    const stored = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
    if (stored.seniorToken && stored.seniorTokenTs) {
      const age = Date.now() - (stored.seniorTokenTs as number);
      if (age < SENIOR_TOKEN_MAX_AGE_MS) return stored.seniorToken as string;
    }
    return null;
  }
}

interface ClockingEvent {
  id: string;
  dateEvent: string; // "2026-05-14"
  timeEvent: string; // "15:31:34" ou "15:31:34.523"
  platform?: string; // "android" | "ios" | "Web"
}

interface ClockingResponse {
  count: number;
  totalPages: number;
  result: ClockingEvent[];
}

/**
 * Filtra batimentos da data alvo e extrai HH:MM ordenados.
 *
 * `timeEvent` vem em formatos variados:
 *   - "15:31:34" (mobile)
 *   - "14:05:03.523" (web com millis)
 * O regex pega só HH:MM dos dois.
 */
export function parseClockingResponse(json: ClockingResponse, targetDate: string): string[] {
  if (!json?.result || !Array.isArray(json.result)) return [];
  const times: string[] = [];
  for (const e of json.result) {
    if (e.dateEvent !== targetDate) continue;
    const m = e.timeEvent?.match(/^(\d{2}):(\d{2})/);
    if (m) times.push(`${m[1]}:${m[2]}`);
  }
  return [...new Set(times)].sort();
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
