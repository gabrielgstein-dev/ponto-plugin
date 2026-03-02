import type { IPunchProvider } from '../../domain/interfaces';
import { findSeniorTab } from './tab-utils';
import { extractTimesFromApiResponse } from './api-response-parser';
import { SeniorCookieAuth } from './senior-cookie-auth';
import { SeniorPageAuth } from './senior-page-auth';
import { SeniorInterceptorAuth } from './senior-interceptor-auth';

let _cachedEndpoint: { url: string; method: string; body: string | null } | null = null;
let _allFailTs = 0;
const FAIL_COOLDOWN_MS = 2 * 60000;
let _cachedTimes: string[] | null = null;
let _cachedTimesTs = 0;
const CACHE_TTL_MS = 30000;

const cookieAuth = new SeniorCookieAuth();
const pageAuth = new SeniorPageAuth();
const interceptorAuth = new SeniorInterceptorAuth();

export class SeniorApiPunchProvider implements IPunchProvider {
  readonly name = 'seniorApi';
  readonly priority = 3;

  async fetchPunches(_date: Date): Promise<string[]> {
    if (Date.now() - _allFailTs < FAIL_COOLDOWN_MS) return _cachedTimes ?? [];
    if (_cachedTimes && Date.now() - _cachedTimesTs < CACHE_TTL_MS) return _cachedTimes;

    const tab = await findSeniorTab();
    if (!tab?.id) return [];

    // Tenta as mesmas 3 fontes de token que o backup usava em getAccessToken()
    const token = await this.resolveToken();
    if (!token) return [];

    return this.fetchViaTab(tab.id, token);
  }

  private async resolveToken(): Promise<string | null> {
    // 1. Cookie OAuth (com.senior.token)
    const cookieToken = await cookieAuth.getAccessToken();
    if (cookieToken) return cookieToken;

    // 2. Intercepted Bearer salvo no background (seniorToken)
    const stored = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
    if (stored.seniorToken) {
      const ageMin = (Date.now() - (stored.seniorTokenTs || 0)) / 60000;
      if (ageMin < 60) return stored.seniorToken;
    }

    // 3. Page scan: varre sessionStorage/localStorage da aba Senior
    const pageToken = await pageAuth.getAccessToken();
    if (pageToken) return pageToken;

    // 4. Bearer capturado pelo interceptor do content script
    const interceptorToken = await interceptorAuth.getAccessToken();
    if (interceptorToken) return interceptorToken;

    return null;
  }

  private async fetchViaTab(tabId: number, token: string): Promise<string[]> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [token, _cachedEndpoint],
      func: async (accessToken: string, cached: { url: string; method: string; body: string | null } | null) => {
        const BASE = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest';
        const H = { 'Authorization': `bearer ${accessToken}`, 'Content-Type': 'application/json' };
        const d = new Date();
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const endpoints = cached
          ? [{ url: cached.url, method: cached.method, body: cached.body === '__date__' ? { startDate: ds, endDate: ds, date: ds } : (cached.body ? JSON.parse(cached.body) : {}) }]
          : [
            { url: `${BASE}/hcm/pontomobile_bff/queries/getClockingEventsQuery`, method: 'POST', body: {} },
            { url: `${BASE}/hcm/pontomobile_bff/queries/getLastClockingEventsQuery`, method: 'POST', body: {} },
            { url: `${BASE}/hcm/pontomobile_bff/queries/getEmployeeClockingEventsQuery`, method: 'POST', body: {} },
            { url: `${BASE}/hcm/pontomobile_clocking_event/queries/listClockingEvent`, method: 'POST', body: {} },
            { url: `${BASE}/hcm/pontomobile_clocking_event/queries/getClockingEvent`, method: 'POST', body: {} },
            { url: `${BASE}/hcm/pontomobile_clocking_event/queries/clockingEventList`, method: 'POST', body: { startDate: ds, endDate: ds } },
            { url: `${BASE}/hcm/pontomobile_clocking_event/queries/getClockingEventByEmployee`, method: 'POST', body: { startDate: ds, endDate: ds } },
            { url: `${BASE}/hcm/pontomobile_clocking_event/entities/clockingEvent`, method: 'GET', body: null },
            { url: `${BASE}/hcm/pontomobile_clocking_event/queries/getByDate`, method: 'POST', body: { date: ds } },
            { url: `${BASE}/hcm/gestao_ponto/queries/getMarcacoes`, method: 'POST', body: { dataInicio: ds, dataFim: ds } },
            { url: `${BASE}/hcm/gestao_ponto/queries/getClockingsByPeriod`, method: 'POST', body: { startDate: ds, endDate: ds } },
          ];

        for (const ep of endpoints) {
          try {
            const opts: RequestInit = { method: ep.method, headers: H };
            if (ep.method === 'POST') opts.body = JSON.stringify(ep.body);
            const r = await fetch(ep.url, opts);
            if (!r.ok) continue;
            const text = await r.text();
            return { url: ep.url, method: ep.method, body: JSON.stringify(ep.body), text };
          } catch (_) {}
        }
        return null;
      },
    });

    const data = results?.[0]?.result;
    if (!data?.text) {
      _allFailTs = Date.now();
      console.warn('[Senior Ponto] SeniorApi: todos endpoints falharam, cooldown 2min');
      return [];
    }

    try {
      const json = JSON.parse(data.text);
      const times = extractTimesFromApiResponse(json);
      if (times.length > 0) {
        _cachedEndpoint = { url: data.url, method: data.method, body: data.body };
        _cachedTimes = times;
        _cachedTimesTs = Date.now();
        _allFailTs = 0;
      }
      return times;
    } catch (_) {
      _allFailTs = Date.now();
      return [];
    }
  }
}
