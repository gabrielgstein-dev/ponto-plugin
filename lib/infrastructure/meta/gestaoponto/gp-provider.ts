import type { IPunchProvider } from '../../../domain/interfaces';
import { todayDateStr } from '../../../domain/time-utils';
import { getGpAssertion, invalidateGpCache } from './gp-auth';
import { fetchGpViaTabs } from './gp-tab';
import { GP_API_BASE } from './constants';
let _lastFailTs = 0;
let _cachedResult: string[] | null = null;
let _cachedTs = 0;

export class GpPunchProvider implements IPunchProvider {
  readonly name = 'gestaoPonto';
  readonly priority = 1;

  async fetchPunches(_date: Date, aggressive = false): Promise<string[]> {
    if (Date.now() - _lastFailTs < 60000) {
      if (aggressive) console.log('[Senior Ponto] GP: em cooldown de falha, faltam', Math.round((60000 - (Date.now() - _lastFailTs)) / 1000), 's');
      return _cachedResult ?? [];
    }
    if (_cachedResult !== null && Date.now() - _cachedTs < 30000) return _cachedResult;

    const direct = await this.fetchDirect();
    if (direct.ok) {
      _cachedResult = direct.times;
      _cachedTs = Date.now();
      _lastFailTs = 0;
      return direct.times;
    }

    const tabResult = await fetchGpViaTabs(aggressive);
    console.log('[Senior Ponto] GP via tabs:', tabResult.length, 'resultados');
    if (tabResult.length > 0) {
      _cachedResult = tabResult;
      _cachedTs = Date.now();
      _lastFailTs = 0;
    } else {
      _lastFailTs = Date.now();
    }
    return tabResult;
  }

  private async fetchDirect(): Promise<{ times: string[]; ok: boolean }> {
    const auth = await getGpAssertion();
    if (!auth || !auth.assertion) {
      console.log('[Senior Ponto] GP fetchDirect: sem assertion');
      return { times: [], ok: false };
    }

    const stored = await chrome.storage.local.get(['gestaoPontoCodigoCalculo']);
    const colaboradorId = auth.colaboradorId;
    if (!colaboradorId) {
      console.log('[Senior Ponto] GP fetchDirect: sem colaboradorId');
      return { times: [], ok: false };
    }

    const codigoCalculo = auth.codigoCalculo || stored.gestaoPontoCodigoCalculo;
    const dataStr = todayDateStr();
    let url = `${GP_API_BASE}acertoPontoColaboradorPeriodo/colaborador/${colaboradorId}?dataInicial=${dataStr}&dataFinal=${dataStr}&orderby=-dataApuracao`;
    if (codigoCalculo) url += `&codigoCalculo=${codigoCalculo}`;

    console.log('[Senior Ponto] GP fetchDirect:', url);

    try {
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json', 'assertion': auth.assertion, 'zone-offset': String(new Date().getTimezoneOffset()) },
      });
      console.log('[Senior Ponto] GP fetchDirect status:', r.status);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          invalidateGpCache();
          _lastFailTs = Date.now();
        }
        return { times: [], ok: false };
      }
      const json = await r.json();
      const times = parseGpResponse(json);
      console.log('[Senior Ponto] GP fetchDirect marcações:', times);
      return { times, ok: true };
    } catch (e) {
      console.warn('[Senior Ponto] GP fetch direto erro:', (e as Error).message);
      _lastFailTs = Date.now();
      return { times: [], ok: false };
    }
  }
}

export function parseGpResponse(json: Record<string, unknown>): string[] {
  const times: string[] = [];
  const apuracao = json.apuracao as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(apuracao)) return times;

  for (const dia of apuracao) {
    const marcacoes = dia.marcacoes as Array<Record<string, string>> | undefined;
    if (!Array.isArray(marcacoes)) continue;
    for (const m of marcacoes) {
      const match = m.horaAcesso?.match(/(\d{2}):(\d{2})/);
      if (match) times.push(`${match[1]}:${match[2]}`);
    }
  }
  return [...new Set(times)].sort();
}
