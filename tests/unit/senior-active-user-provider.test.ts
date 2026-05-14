/**
 * SeniorActiveUserPunchProvider — canal de detecção SEM aba do Senior aberta.
 *
 * Resolve o cenário em que o user só usa app mobile: o plugin não tem aba do
 * Senior aberta no Chrome, então providers que dependem dela (Storage, Api
 * via tab, Scraper) ficam cegos. GP tem o batimento mas com lag (mobile
 * propaga em minutos pro GP). Esse endpoint pega mobile em real-time.
 *
 * Body shape descoberto em 2026-05-14 via [diegodario88/clockwerk] no GitHub.
 * Schema-trap: `pageSize` é STRING (não number), `pageInfo` é NESTED em
 * `filter`, e `activePlatformUser: true` escopa pro user logado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SeniorActiveUserPunchProvider,
  resetSeniorActiveUserCache,
  parseClockingResponse,
} from '../../lib/infrastructure/senior/senior-active-user-provider';
import { mockCookiesGetAll, mockStorageGet } from '../setup/chrome-mock';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetSeniorActiveUserCache();
  mockCookiesGetAll.mockResolvedValue([]);
  mockStorageGet.mockResolvedValue({});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchOk(body: unknown) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function mockFetchErr(status: number) {
  globalThis.fetch = vi.fn(async () => ({
    ok: false,
    status,
    statusText: 'Forbidden',
    json: async () => ({}),
  })) as unknown as typeof fetch;
}

// ── parseClockingResponse: filtra por data + extrai HH:MM ────────────────────

describe('parseClockingResponse', () => {
  it('extrai HH:MM dos timeEvent da data alvo, em ordem cronológica', () => {
    const json = {
      count: 5,
      totalPages: 1,
      result: [
        { id: '1', dateEvent: '2026-05-14', timeEvent: '15:31:34', platform: 'android' },
        { id: '2', dateEvent: '2026-05-14', timeEvent: '08:43:50.255', platform: 'Web' },
        { id: '3', dateEvent: '2026-05-13', timeEvent: '18:00:00' }, // outra data — ignora
        { id: '4', dateEvent: '2026-05-14', timeEvent: '14:05:03.523', platform: 'Web' },
        { id: '5', dateEvent: '2026-05-14', timeEvent: '15:05:05', platform: 'Web' },
      ],
    };
    expect(parseClockingResponse(json, '2026-05-14')).toEqual(['08:43', '14:05', '15:05', '15:31']);
  });

  it('lida com timeEvent sem millis (mobile) e com millis (web)', () => {
    const json = {
      count: 2, totalPages: 1,
      result: [
        { id: '1', dateEvent: '2026-05-14', timeEvent: '15:31:34' },
        { id: '2', dateEvent: '2026-05-14', timeEvent: '14:05:03.523' },
      ],
    };
    expect(parseClockingResponse(json, '2026-05-14')).toEqual(['14:05', '15:31']);
  });

  it('dedup horários iguais (entrada/saída no mesmo minuto em devices diferentes)', () => {
    const json = {
      count: 2, totalPages: 1,
      result: [
        { id: '1', dateEvent: '2026-05-14', timeEvent: '12:00:01' },
        { id: '2', dateEvent: '2026-05-14', timeEvent: '12:00:55' }, // mesmo HH:MM
      ],
    };
    expect(parseClockingResponse(json, '2026-05-14')).toEqual(['12:00']);
  });

  it('retorna vazio se result é null/undefined/não-array', () => {
    expect(parseClockingResponse({ count: 0, totalPages: 0, result: [] }, '2026-05-14')).toEqual([]);
    // @ts-expect-error testing defensive parsing
    expect(parseClockingResponse({ result: null }, '2026-05-14')).toEqual([]);
    // @ts-expect-error testing defensive parsing
    expect(parseClockingResponse(null, '2026-05-14')).toEqual([]);
  });

  it('ignora entries com timeEvent malformado', () => {
    const json = {
      count: 2, totalPages: 1,
      result: [
        { id: '1', dateEvent: '2026-05-14', timeEvent: 'invalido' },
        { id: '2', dateEvent: '2026-05-14', timeEvent: '08:30:00' },
      ],
    };
    expect(parseClockingResponse(json, '2026-05-14')).toEqual(['08:30']);
  });
});

// ── Provider: integração de auth + fetch + cache + parse ─────────────────────

describe('SeniorActiveUserPunchProvider', () => {
  it('retorna [] quando não tem token (sem cookie, sem storage) — não chama fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const provider = new SeniorActiveUserPunchProvider();
    const result = await provider.fetchPunches(new Date('2026-05-14T12:00:00Z'));
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('usa token do cookie e parseia resposta de hoje', async () => {
    mockCookiesGetAll.mockResolvedValue([
      { name: 'com.senior.token', value: encodeURIComponent(JSON.stringify({ access_token: 'cookie-token-xyz' })) },
    ]);
    mockFetchOk({
      count: 3, totalPages: 1,
      result: [
        { id: '1', dateEvent: '2026-05-14', timeEvent: '15:31:34', platform: 'android' },
        { id: '2', dateEvent: '2026-05-14', timeEvent: '08:43:50.255', platform: 'Web' },
        { id: '3', dateEvent: '2026-05-13', timeEvent: '18:00:00' }, // ignora
      ],
    });
    const provider = new SeniorActiveUserPunchProvider();
    const result = await provider.fetchPunches(new Date('2026-05-14T12:00:00-03:00'));
    expect(result).toEqual(['08:43', '15:31']);
  });

  it('fallback pra seniorToken do storage se cookie ausente', async () => {
    mockCookiesGetAll.mockResolvedValue([]);
    mockStorageGet.mockResolvedValue({
      seniorToken: 'storage-token-abc',
      seniorTokenTs: Date.now(),
    });
    mockFetchOk({ count: 0, totalPages: 0, result: [] });

    const provider = new SeniorActiveUserPunchProvider();
    await provider.fetchPunches(new Date('2026-05-14T12:00:00-03:00'));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('clockingEventByActiveUserQuery'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'bearer storage-token-abc' }),
      }),
    );
  });

  it('manda o body com schema EXATO do Senior (pageSize string, activePlatformUser)', async () => {
    mockCookiesGetAll.mockResolvedValue([
      { name: 'com.senior.token', value: encodeURIComponent(JSON.stringify({ access_token: 'tok' })) },
    ]);
    mockFetchOk({ count: 0, totalPages: 0, result: [] });

    const provider = new SeniorActiveUserPunchProvider();
    await provider.fetchPunches(new Date('2026-05-14T12:00:00-03:00'));

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({
      filter: {
        activePlatformUser: true,
        pageInfo: { page: 0, pageSize: '50' }, // STRING, não number — particularidade do Senior
        nameSearch: '',
        sort: { field: null, order: 'ASC' },
      },
    });
  });

  it('descarta seniorToken expirado (idade > SENIOR_TOKEN_MAX_AGE_MS)', async () => {
    mockCookiesGetAll.mockResolvedValue([]);
    // 7 dias e 1 hora atrás — passou do max age (6.5 dias)
    const expired = Date.now() - (7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
    mockStorageGet.mockResolvedValue({
      seniorToken: 'old-token',
      seniorTokenTs: expired,
    });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new SeniorActiveUserPunchProvider();
    const result = await provider.fetchPunches(new Date('2026-05-14T12:00:00-03:00'));
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('respeita cache de 30s — segunda chamada não refaz fetch', async () => {
    mockCookiesGetAll.mockResolvedValue([
      { name: 'com.senior.token', value: encodeURIComponent(JSON.stringify({ access_token: 'tok' })) },
    ]);
    mockFetchOk({
      count: 1, totalPages: 1,
      result: [{ id: '1', dateEvent: '2026-05-14', timeEvent: '08:00:00' }],
    });

    const provider = new SeniorActiveUserPunchProvider();
    const r1 = await provider.fetchPunches(new Date('2026-05-14T12:00:00-03:00'));
    const r2 = await provider.fetchPunches(new Date('2026-05-14T12:00:01-03:00'));
    expect(r1).toEqual(['08:00']);
    expect(r2).toEqual(['08:00']);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('cooldown de falha — 401/403 evita re-fetch por 2min', async () => {
    mockCookiesGetAll.mockResolvedValue([
      { name: 'com.senior.token', value: encodeURIComponent(JSON.stringify({ access_token: 'tok' })) },
    ]);
    mockFetchErr(401);

    const provider = new SeniorActiveUserPunchProvider();
    await provider.fetchPunches(new Date('2026-05-14T12:00:00-03:00'));
    await provider.fetchPunches(new Date('2026-05-14T12:00:01-03:00'));

    // Só 1 chamada — cooldown bloqueia a segunda
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('retorna array vazio sem crashar quando fetch lança erro de rede', async () => {
    mockCookiesGetAll.mockResolvedValue([
      { name: 'com.senior.token', value: encodeURIComponent(JSON.stringify({ access_token: 'tok' })) },
    ]);
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const provider = new SeniorActiveUserPunchProvider();
    const result = await provider.fetchPunches(new Date('2026-05-14T12:00:00-03:00'));
    expect(result).toEqual([]);
  });

  it('priority 1 — primary provider, roda em paralelo com GP', () => {
    expect(new SeniorActiveUserPunchProvider().priority).toBe(1);
  });

  it('formata data alvo usando timezone LOCAL (não UTC)', async () => {
    mockCookiesGetAll.mockResolvedValue([
      { name: 'com.senior.token', value: encodeURIComponent(JSON.stringify({ access_token: 'tok' })) },
    ]);
    mockFetchOk({
      count: 2, totalPages: 1,
      result: [
        // Dois dias diferentes
        { id: '1', dateEvent: '2026-05-14', timeEvent: '15:31:00' },
        { id: '2', dateEvent: '2026-05-13', timeEvent: '20:00:00' },
      ],
    });
    const provider = new SeniorActiveUserPunchProvider();
    // Date em 2026-05-14 local — espera só 15:31 (não pega o de 13)
    const result = await provider.fetchPunches(new Date(2026, 4, 14, 18, 0, 0));
    expect(result).toEqual(['15:31']);
  });
});
