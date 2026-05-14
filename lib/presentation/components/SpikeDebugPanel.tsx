import { useState, useCallback } from 'react';

interface SpikeResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface SeniorAttempt {
  endpoint: string;
  method: string;
  status: number;
  ok: boolean;
  detectedTimes: string[];
  bodyPreview: string;
  contentType: string;
  errorMessage?: string;
}

interface SeniorResult {
  totalAttempts: number;
  winner: SeniorAttempt | null;
  attempts: SeniorAttempt[];
  tokenInfo: { prefix: string; length: number; ageMs: number | null };
}

interface GpResult {
  ok: boolean;
  status: number;
  bodyPreview: string;
  contentType: string;
  detectedTimes: string[];
  errorMessage?: string;
  authInfo: { hasAssertion: boolean; colaboradorId: string | null; codigoCalculo: string | null };
}

/**
 * Spike: painel temporário pra validar fetch direto Mobile→Plugin.
 *
 * Teste Senior agora varre os 11 endpoints conhecidos e reporta status de cada.
 * Achado em 2026-05-14: bridge `hcm/pontomobile_bff` aceita SW fetch (CORS *,
 * auth ok); a questão é só achar o comando que existe no Senior atual.
 */
export function SpikeDebugPanel() {
  const [seniorResult, setSeniorResult] = useState<SpikeResult | null>(null);
  const [gpResult, setGpResult] = useState<SpikeResult | null>(null);
  const [seniorLoading, setSeniorLoading] = useState(false);
  const [gpLoading, setGpLoading] = useState(false);

  const runSenior = useCallback(async () => {
    setSeniorLoading(true);
    setSeniorResult(null);
    try {
      const r = await chrome.runtime.sendMessage({ type: 'SPIKE_SENIOR_DIRECT_FETCH' });
      setSeniorResult(r as SpikeResult);
    } catch (e) {
      setSeniorResult({ ok: false, error: (e as Error).message });
    } finally {
      setSeniorLoading(false);
    }
  }, []);

  const runGp = useCallback(async () => {
    setGpLoading(true);
    setGpResult(null);
    try {
      const r = await chrome.runtime.sendMessage({ type: 'SPIKE_GP_DIRECT_FETCH' });
      setGpResult(r as SpikeResult);
    } catch (e) {
      setGpResult({ ok: false, error: (e as Error).message });
    } finally {
      setGpLoading(false);
    }
  }, []);

  return (
    <details className="spike-debug-panel">
      <summary>🔬 Spike — fetch direto (mobile sync)</summary>
      <div className="spike-body">
        <p className="spike-hint">
          Bata ponto no celular, então clique nos dois botões. Senior varre
          os 11 endpoints; GP é a fonte do plugin hoje. Compare <code>detectedTimes</code>.
        </p>
        <div className="spike-actions">
          <button type="button" onClick={runSenior} disabled={seniorLoading}>
            {seniorLoading ? 'Varrendo 11 endpoints...' : 'Test Senior'}
          </button>
          <button type="button" onClick={runGp} disabled={gpLoading}>
            {gpLoading ? 'Testando...' : 'Test GP'}
          </button>
        </div>
        {seniorResult && <SeniorResultBlock data={seniorResult} />}
        {gpResult && <GpResultBlock data={gpResult} />}
      </div>
    </details>
  );
}

function SeniorResultBlock({ data }: { data: SpikeResult }) {
  const r = data.result as SeniorResult | undefined;
  return (
    <div className="spike-result">
      <div className="spike-result-header">Senior pontomobile_bff (11 endpoints)</div>
      {data.error && <div className="spike-error">erro: {data.error}</div>}
      {!data.ok && !data.error && <div className="spike-error">falhou</div>}
      {r && (
        <>
          {r.winner ? (
            <>
              <div className="spike-winner">
                <strong>✅ Endpoint vencedor:</strong> {endpointShort(r.winner.endpoint)}
              </div>
              <div>
                <strong>detectedTimes:</strong> {r.winner.detectedTimes.join(', ')}
              </div>
            </>
          ) : (
            <div className="spike-error">
              ❌ Nenhum dos {r.totalAttempts} endpoints retornou batimentos.
            </div>
          )}
          <details>
            <summary>todas as {r.attempts.length} tentativas</summary>
            <table className="spike-attempts">
              <thead>
                <tr>
                  <th>status</th>
                  <th>times</th>
                  <th>endpoint</th>
                </tr>
              </thead>
              <tbody>
                {r.attempts.map((a, i) => (
                  <tr key={i} className={a.ok && a.detectedTimes.length > 0 ? 'win' : ''}>
                    <td>{a.status || (a.errorMessage ? 'ERR' : '?')}</td>
                    <td>{a.detectedTimes.length || '—'}</td>
                    <td title={a.endpoint}>{endpointShort(a.endpoint)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details>
            <summary>raw json</summary>
            <pre className="spike-body-preview">{JSON.stringify(r, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}

function GpResultBlock({ data }: { data: SpikeResult }) {
  const r = data.result as GpResult | undefined;
  return (
    <div className="spike-result">
      <div className="spike-result-header">GP acertoPontoColaboradorPeriodo</div>
      {data.error && <div className="spike-error">erro: {data.error}</div>}
      {r && (
        <>
          <div>
            <strong>status:</strong> {r.status} {r.ok ? '✓' : '✗'}
          </div>
          <div>
            <strong>detectedTimes:</strong>{' '}
            {r.detectedTimes.length > 0 ? r.detectedTimes.join(', ') : '(vazio)'}
          </div>
          {r.errorMessage && <div className="spike-error">{r.errorMessage}</div>}
          <details>
            <summary>body preview</summary>
            <pre className="spike-body-preview">{r.bodyPreview}</pre>
          </details>
          <details>
            <summary>raw json</summary>
            <pre className="spike-body-preview">{JSON.stringify(r, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}

function endpointShort(url: string): string {
  return url.replace('https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/hcm/', '');
}
