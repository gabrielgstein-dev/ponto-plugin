/**
 * Spike: fetch direto do service worker contra `platform.senior.com.br`,
 * sem aba aberta.
 *
 * Achado empírico (2026-05-14): o bridge `hcm/pontomobile_bff` aceita fetch
 * do SW com bearer capturado passivamente — CORS aberto (`access-control-
 * allow-origin: *`), auth passa. O problema é só descobrir o nome do
 * comando que existe no Senior atual: `getLastClockingEventsQuery` retornou
 * `bridge.unknown_command`. Esse helper varre os 11 endpoints conhecidos do
 * `senior-api-provider.ts` e reporta status individual de cada um.
 *
 * Cenários esperados por tentativa:
 *   - 200 + JSON com batimentos: vencedor, esse é o endpoint pra usar
 *   - 404 `bridge.unknown_command`: comando não existe — ignora, tenta próximo
 *   - 401: token expirado/scope errado — refresh resolve ou comando exige
 *     outro scope (mobile OAuth client_id diferente do web)
 *   - 403: CORS/permission — improvável dado teste anterior
 *   - 200 mas vazio: comando existe mas não retorna batimentos do dia
 */
import { debugLog } from '../../domain/debug';
import { extractTimesFromApiResponse } from './api-response-parser';

export interface SeniorDirectFetchAttempt {
  endpoint: string;
  method: string;
  body: string;
  status: number;
  ok: boolean;
  bodyPreview: string;
  detectedTimes: string[];
  contentType: string;
  errorMessage?: string;
}

export interface SeniorDirectFetchResult {
  totalAttempts: number;
  winner: SeniorDirectFetchAttempt | null;
  attempts: SeniorDirectFetchAttempt[];
  tokenInfo: { prefix: string; length: number; ageMs: number | null };
}

const SENIOR_BASE = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildEndpoints(): Array<{ url: string; method: string; body: unknown }> {
  const ds = todayStr();
  return [
    // Self-service scope — descoberto na doc oficial em 2026-05-14, no service
    // `pontomobile` (diferente de `pontomobile_bff` e `pontomobile_clocking_event`).
    // Documentado como "recupera marcações paginadas do colaborador do usuário
    // que realizou a requisição" — bypassa o `Visualizar` resource-wide que deu
    // 403 nos outros endpoints.
    //
    // Iter 1 (2026-05-14): mandar `{filter: {}}` → 400 "pageInfo is required".
    // Iter 2: adicionar `pageInfo` com paginação padrão. `filter.dateRange` é
    // o palpite mais comum em APIs Senior (visto em outros services).
    // Schema descoberto via [diegodario88/clockwerk](https://github.com/diegodario88/clockwerk):
    //   - `pageInfo` é NESTED dentro de `filter` (não top-level)
    //   - `pageSize` é STRING (não number) — particularidade do Senior
    //   - `activePlatformUser: true` é o flag mágico que escopa pro user logado
    //
    // Resposta validada em 2026-05-14: 200 com 824 entries, incluindo batimento
    // `platform: android` em real-time. Camada 1 viável.
    {
      url: `${SENIOR_BASE}/hcm/pontomobile/queries/clockingEventByActiveUserQuery`,
      method: 'POST',
      body: {
        filter: {
          activePlatformUser: true,
          pageInfo: { page: 0, pageSize: '20' },
          nameSearch: '',
          sort: { field: null, order: 'ASC' },
        },
      },
    },
    // Endpoints originais do `senior-api-provider.ts` (todos 404 ou 403 em 2026-05-14)
    { url: `${SENIOR_BASE}/hcm/pontomobile_bff/queries/getLastClockingEventsQuery`, method: 'POST', body: {} },
    { url: `${SENIOR_BASE}/hcm/pontomobile_bff/queries/getClockingEventsQuery`, method: 'POST', body: {} },
    { url: `${SENIOR_BASE}/hcm/pontomobile_bff/queries/getEmployeeClockingEventsQuery`, method: 'POST', body: {} },
    { url: `${SENIOR_BASE}/hcm/pontomobile_clocking_event/queries/listClockingEvent`, method: 'POST', body: {} },
    { url: `${SENIOR_BASE}/hcm/pontomobile_clocking_event/queries/getClockingEvent`, method: 'POST', body: {} },
    { url: `${SENIOR_BASE}/hcm/pontomobile_clocking_event/queries/clockingEventList`, method: 'POST', body: { startDate: ds, endDate: ds } },
    { url: `${SENIOR_BASE}/hcm/pontomobile_clocking_event/queries/getClockingEventByEmployee`, method: 'POST', body: { startDate: ds, endDate: ds } },
    { url: `${SENIOR_BASE}/hcm/pontomobile_clocking_event/entities/clockingEvent`, method: 'GET', body: null },
    { url: `${SENIOR_BASE}/hcm/pontomobile_clocking_event/queries/getByDate`, method: 'POST', body: { date: ds } },
    { url: `${SENIOR_BASE}/hcm/gestao_ponto/queries/getMarcacoes`, method: 'POST', body: { dataInicio: ds, dataFim: ds } },
    { url: `${SENIOR_BASE}/hcm/gestao_ponto/queries/getClockingsByPeriod`, method: 'POST', body: { startDate: ds, endDate: ds } },
  ];
}

async function tryEndpoint(
  ep: { url: string; method: string; body: unknown },
  token: string,
): Promise<SeniorDirectFetchAttempt> {
  const bodyJson = ep.body == null ? '' : JSON.stringify(ep.body);
  try {
    const init: RequestInit = {
      method: ep.method,
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };
    if (ep.method !== 'GET') init.body = bodyJson || '{}';

    const r = await fetch(ep.url, init);
    const text = await r.text();
    const preview = text.length > 400 ? text.slice(0, 400) + '…' : text;

    let detectedTimes: string[] = [];
    try {
      const json = JSON.parse(text);
      detectedTimes = extractTimesFromApiResponse(json);
    } catch (_) { /* não-JSON */ }

    return {
      endpoint: ep.url,
      method: ep.method,
      body: bodyJson,
      status: r.status,
      ok: r.ok,
      bodyPreview: preview,
      detectedTimes,
      contentType: r.headers.get('content-type') ?? '',
    };
  } catch (e) {
    const err = e as Error;
    return {
      endpoint: ep.url,
      method: ep.method,
      body: bodyJson,
      status: 0,
      ok: false,
      bodyPreview: '',
      detectedTimes: [],
      contentType: '',
      errorMessage: `${err.name}: ${err.message}`,
    };
  }
}

export async function directFetchSenior(
  token: string,
  tokenAgeMs: number | null,
): Promise<SeniorDirectFetchResult> {
  const tokenInfo = {
    prefix: token.substring(0, 8),
    length: token.length,
    ageMs: tokenAgeMs,
  };
  const endpoints = buildEndpoints();
  debugLog('[spike] directFetchSenior varrendo', endpoints.length, 'endpoints');

  const attempts: SeniorDirectFetchAttempt[] = [];
  let winner: SeniorDirectFetchAttempt | null = null;

  // Sequencial pra não estourar rate-limit + parar no primeiro vencedor
  for (const ep of endpoints) {
    const attempt = await tryEndpoint(ep, token);
    attempts.push(attempt);
    if (attempt.ok && attempt.detectedTimes.length > 0 && !winner) {
      winner = attempt;
      break; // Primeiro vencedor real (200 + dados) — para de procurar
    }
  }

  return {
    totalAttempts: attempts.length,
    winner,
    attempts,
    tokenInfo,
  };
}
