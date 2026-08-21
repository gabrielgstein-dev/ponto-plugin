/**
 * Spike: variante diagnóstica do `fetchDirect` do `GpPunchProvider`.
 *
 * O GP já roda sem aba — esse helper retorna a resposta crua (status, body,
 * headers) pra comparar lado-a-lado com `directFetchSenior` e descobrir qual
 * canal pega marcações mobile primeiro. Reusa `getGpAssertion` e
 * `parseGpResponse` pra não divergir do path de produção.
 */
import { todayDateStr } from '../../../domain/time-utils';
import { debugLog } from '../../../domain/debug';
import { getGpAssertion } from './gp-auth';
import { parseGpResponse } from './gp-provider';
import { GP_API_BASE } from './constants';

export interface GpDirectFetchResult {
  ok: boolean;
  status: number;
  bodyPreview: string;
  bodyLength: number;
  contentType: string;
  responseHeaders: Record<string, string>;
  errorMessage?: string;
  endpoint: string;
  detectedTimes: string[];
  authInfo: { hasAssertion: boolean; colaboradorId: string | null; codigoCalculo: string | null };
}

export async function directFetchGp(): Promise<GpDirectFetchResult> {
  const auth = await getGpAssertion();
  const authInfo = {
    hasAssertion: !!auth?.assertion,
    colaboradorId: auth?.colaboradorId ?? null,
    codigoCalculo: auth?.codigoCalculo ?? null,
  };

  if (!auth?.assertion || !auth.colaboradorId) {
    return {
      ok: false,
      status: 0,
      bodyPreview: '',
      bodyLength: 0,
      contentType: '',
      responseHeaders: {},
      errorMessage: !auth?.assertion
        ? 'sem assertion GP (rode com aba do Senior aberta uma vez pra capturar)'
        : 'sem colaboradorId',
      endpoint: GP_API_BASE,
      detectedTimes: [],
      authInfo,
    };
  }

  const dataStr = todayDateStr();
  let url = `${GP_API_BASE}acertoPontoColaboradorPeriodo/colaborador/${auth.colaboradorId}?dataInicial=${dataStr}&dataFinal=${dataStr}&orderby=-dataApuracao`;
  if (auth.codigoCalculo) url += `&codigoCalculo=${auth.codigoCalculo}`;

  debugLog('[spike] directFetchGp pre-flight', JSON.stringify({ endpoint: url, authInfo }));

  try {
    const r = await fetch(url, {
      headers: {
        Accept: 'application/json',
        assertion: auth.assertion,
        'zone-offset': String(new Date().getTimezoneOffset()),
      },
    });
    const text = await r.text();
    const preview = text.length > 600 ? text.slice(0, 600) + '…' : text;
    const responseHeaders: Record<string, string> = {};
    r.headers.forEach((v, k) => { responseHeaders[k] = v; });

    let detectedTimes: string[] = [];
    try {
      const json = JSON.parse(text);
      detectedTimes = parseGpResponse(json, dataStr);
    } catch (_) {
      // Resposta não-JSON.
    }

    return {
      ok: r.ok,
      status: r.status,
      bodyPreview: preview,
      bodyLength: text.length,
      contentType: r.headers.get('content-type') ?? '',
      responseHeaders,
      endpoint: url,
      detectedTimes,
      authInfo,
    };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      status: 0,
      bodyPreview: '',
      bodyLength: 0,
      contentType: '',
      responseHeaders: {},
      errorMessage: `${err.name}: ${err.message}`,
      endpoint: url,
      detectedTimes: [],
      authInfo,
    };
  }
}
