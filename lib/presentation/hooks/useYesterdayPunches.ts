import { useState, useEffect } from 'react';
import { getGpAssertion } from '../../infrastructure/senior/gp-auth';
import { parseGpResponse } from '../../infrastructure/senior/gp-provider';
import { GP_API_BASE } from '../../infrastructure/senior/constants';
import { padZero } from '../../domain/time-utils';
import { ENABLE_YESTERDAY, ENABLE_SENIOR_INTEGRATION } from '../../domain/build-flags';

export function useYesterdayPunches(): string[] {
  const [times, setTimes] = useState<string[]>([]);

  useEffect(() => {
    if (!ENABLE_YESTERDAY || !ENABLE_SENIOR_INTEGRATION) return;
    fetchYesterday().then(setTimes).catch(() => {});
  }, []);

  return times;
}

async function fetchYesterday(): Promise<string[]> {
  const auth = await getGpAssertion();
  if (!auth?.assertion || !auth.colaboradorId) return [];

  const stored = await chrome.storage.local.get(['gestaoPontoCodigoCalculo']);
  const codigoCalculo = auth.codigoCalculo || stored.gestaoPontoCodigoCalculo;

  const d = new Date();
  d.setDate(d.getDate() - 1);
  const ds = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;

  let url = `${GP_API_BASE}acertoPontoColaboradorPeriodo/colaborador/${auth.colaboradorId}?dataInicial=${ds}&dataFinal=${ds}&orderby=-dataApuracao`;
  if (codigoCalculo) url += `&codigoCalculo=${codigoCalculo}`;

  try {
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'assertion': auth.assertion, 'zone-offset': String(new Date().getTimezoneOffset()) },
    });
    if (!r.ok) return [];
    const json = await r.json();
    return parseGpResponse(json);
  } catch (_) {
    return [];
  }
}
