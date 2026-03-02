export interface GpFetchResult {
  times: string[];
  colaboradorId?: string;
  codigoCalculo?: string;
  logs?: string[];
  error?: string;
}

export async function executeGpFetch(tabId: number): Promise<GpFetchResult | null> {
  const stored = await chrome.storage.local.get(['gestaoPontoColaboradorId', 'gestaoPontoCodigoCalculo']);

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [stored.gestaoPontoColaboradorId || '', stored.gestaoPontoCodigoCalculo || ''],
    func: async (knownColabId: string, knownCalculo: string) => {
      const logs: string[] = [];
      const log = (msg: string) => logs.push(msg);

      let assertion: string | null = null;
      try { assertion = JSON.parse(sessionStorage.getItem('SeniorGPOSession') || '{}').token; } catch (_) {}
      if (!assertion) {
        log('Sem assertion em SeniorGPOSession');
        return { times: [] as string[], logs, error: 'no_assertion' };
      }
      log('Assertion: ' + assertion.substring(0, 30) + '...');

      const h: Record<string, string> = {
        'Accept': 'application/json',
        'assertion': assertion,
        'zone-offset': String(new Date().getTimezoneOffset()),
      };
      const base = '/gestaoponto-backend/api/';
      let colaboradorId = knownColabId;
      log('knownColabId: ' + knownColabId + ', knownCalculo: ' + knownCalculo);

      if (!colaboradorId) {
        colaboradorId = await discoverColaboradorId(base, h);
        if (!colaboradorId) {
          log('Não encontrou colaboradorId');
          return { times: [] as string[], logs, error: 'no_colab_id' };
        }
      }
      log('colaboradorId: ' + colaboradorId);

      let calculo = knownCalculo;
      if (!calculo) {
        calculo = await discoverCodigoCalculo(base, h, colaboradorId);
        log('codigoCalculo descoberto: ' + (calculo || '(vazio)'));
      }

      const result = await fetchPunchData(base, h, colaboradorId, calculo);
      if (result) result.logs = logs;
      return result;

      async function discoverCodigoCalculo(apiBase: string, headers: Record<string, string>, colabId: string): Promise<string> {
        const endpoints = [
          `${apiBase}periodoCalculo/vigente/colaborador/${colabId}`,
          `${apiBase}periodoCalculo/aberto/colaborador/${colabId}`,
        ];
        for (const url of endpoints) {
          try {
            const r = await fetch(url, { headers });
            log('discoverCalculo ' + url + ' \u2192 ' + r.status);
            if (!r.ok) continue;
            const body = JSON.stringify(await r.json());
            log('discoverCalculo resp: ' + body.substring(0, 300));
            const m = body.match(/"(?:codigoCalculo|codCalculo|codigo)"[:\s]*"?(\d+)"?/);
            if (m) { log('discoverCalculo match: ' + m[1]); return m[1]; }
          } catch (e) { log('discoverCalculo erro: ' + (e as Error).message); }
        }
        try {
          const sessionRaw = sessionStorage.getItem('SeniorGPOSession') || '{}';
          const session = JSON.parse(sessionRaw);
          log('SeniorGPOSession keys: ' + Object.keys(session).join(', '));
          if (session.codigoCalculo) { log('session.codigoCalculo: ' + session.codigoCalculo); return String(session.codigoCalculo); }
          if (session.userRange && Array.isArray(session.userRange)) {
            log('session.userRange: ' + JSON.stringify(session.userRange).substring(0, 300));
            for (const entry of session.userRange) {
              const cond = (entry.condition || entry.Condition || JSON.stringify(entry)) as string;
              const m = cond.match(/CodCal[=:]\s*\d+[-\u2013]?(\d+)/);
              if (m) { log('userRange match: ' + m[1]); return m[1]; }
            }
          }
        } catch (_) {}
        return '';
      }

      async function discoverColaboradorId(apiBase: string, headers: Record<string, string>): Promise<string> {
        const discoverUrls = [
          `${apiBase}usuario/logado`,
          `${apiBase}colaborador/logado`,
          `${apiBase}periodoAtual`,
          `${apiBase}configuracao/colaboradorLogado`,
        ];
        for (const url of discoverUrls) {
          try {
            const r = await fetch(url, { headers });
            log('discoverColab ' + url + ' \u2192 ' + r.status);
            if (!r.ok) continue;
            const str = JSON.stringify(await r.json());
            log('discoverColab resp: ' + str.substring(0, 300));
            const m = str.match(/"(?:id|colaboradorId|employeeId)"\s*:\s*"(\d+-\d+-\d+)"/);
            if (m) { log('discoverColab match: ' + m[1]); return m[1]; }
          } catch (e) { log('discoverColab erro: ' + (e as Error).message); }
        }

        try {
          const payload = JSON.parse(atob(assertion!.split('.')[1]));
          log('JWT payload userId: ' + payload.userId);
          if (payload.userId) {
            const url = `${apiBase}colaborador/usuario/${payload.userId}`;
            const r = await fetch(url, { headers });
            log('colabByUser ' + url + ' \u2192 ' + r.status);
            if (r.ok) {
              const str = JSON.stringify(await r.json());
              const m = str.match(/(\d+-\d+-\d+)/);
              if (m) { log('colabByUser match: ' + m[1]); return m[1]; }
            }
          }
        } catch (e) { log('JWT parse erro: ' + (e as Error).message); }

        return '';
      }

      async function fetchPunchData(apiBase: string, headers: Record<string, string>, colabId: string, calcCode: string) {
        const d = new Date();
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        let url = `${apiBase}acertoPontoColaboradorPeriodo/colaborador/${colabId}?dataInicial=${ds}&dataFinal=${ds}&orderby=-dataApuracao`;
        if (calcCode) url += `&codigoCalculo=${calcCode}`;

        try {
          log('Fetch: ' + url);
          const r = await fetch(url, { headers });
          log('Status: ' + r.status);
          if (!r.ok) return { times: [] as string[], logs, error: 'http_' + r.status, colaboradorId: colabId, codigoCalculo: calcCode || undefined };
          const json = await r.json();
          log('Response: ' + JSON.stringify(json).substring(0, 500));
          const times: string[] = [];
          for (const dia of (json.apuracao || [])) {
            for (const m of (dia.marcacoes || [])) {
              const mt = m.horaAcesso?.match(/(\d{2}):(\d{2})/);
              if (mt) times.push(`${mt[1]}:${mt[2]}`);
            }
          }
          const unique = [...new Set(times)].sort();
          log('Marcações: ' + JSON.stringify(unique));
          return {
            times: unique,
            logs,
            colaboradorId: colabId,
            codigoCalculo: json.codigoCalculo || calcCode,
          };
        } catch (e) {
          log('Fetch erro: ' + (e as Error).message);
          return { times: [] as string[], logs, error: 'fetch_error', colaboradorId: colabId };
        }
      }
    },
  });

  return results?.[0]?.result ?? null;
}
