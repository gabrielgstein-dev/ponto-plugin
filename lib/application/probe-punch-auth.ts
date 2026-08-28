import { auditLog } from '../domain/debug';
import { findSeniorTab } from '../infrastructure/senior/tab-utils';
import { SeniorPageAuth } from '../infrastructure/senior/senior-page-auth';
import { SeniorInterceptorAuth } from '../infrastructure/senior/senior-interceptor-auth';
import { SeniorTokenStorageAuth } from '../infrastructure/senior/senior-token-storage-auth';
import { SeniorPunchRegistrar } from '../infrastructure/senior/senior-registrar';
import type { IAuthProvider } from '../domain/interfaces';
import type { PunchResult } from '../domain/types';

// Mesmo endpoint que o SeniorPunchRegistrar chama ANTES de importar. É uma
// LEITURA (getEmployeeClockingConfigQuery) — não registra ponto. Se um token
// passa aqui, tem escopo no serviço de ponto e o import provavelmente também
// passa; se dá 403, é o token errado e sabemos disso sem sujar o cartão.
const CONFIG_URL =
  'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/hcm/pontomobile_bff/queries/getEmployeeClockingConfigQuery';

interface ProbeResult {
  provider: string;
  token: 'absent' | string; // 'absent' ou prefixo (8 chars) do token
  status: number | null;
  ok: boolean;
  bodyPreview: string;
}

/**
 * Diagnóstico READ-ONLY: para cada fonte de auth, tenta obter um token e bate
 * SÓ no endpoint de config (leitura). Nunca chama o import. Responde a pergunta
 * "qual token o Senior aceita no serviço de ponto?" sem registrar batida.
 *
 * Testa cada provider isoladamente de propósito — a cadeia de produção para no
 * primeiro token, mas aqui queremos saber QUAL funciona, não só o primeiro.
 */
export async function probePunchAuth(): Promise<ProbeResult[]> {
  auditLog('Probe: iniciando diagnóstico read-only de auth de batida...');

  const tab = await findSeniorTab();
  if (!tab?.id) {
    auditLog('Probe: nenhuma aba Senior aberta — abra o Senior e rode de novo');
    return [];
  }
  auditLog(`Probe: usando aba Senior ${tab.id} (${tab.url?.slice(0, 60)})`);

  const providers: IAuthProvider[] = [
    new SeniorPageAuth(),
    new SeniorInterceptorAuth(),
    new SeniorTokenStorageAuth(),
  ];

  const results: ProbeResult[] = [];

  for (const provider of providers) {
    let token: string | null = null;
    try {
      token = await provider.getAccessToken();
    } catch (e) {
      auditLog(`Probe: ${provider.name} lançou erro ao obter token: ${(e as Error).message}`);
    }

    if (!token) {
      auditLog(`Probe: ${provider.name} → sem token`);
      results.push({ provider: provider.name, token: 'absent', status: null, ok: false, bodyPreview: '' });
      continue;
    }

    const probe = await callConfig(tab.id, token).catch(e => ({
      status: null as number | null,
      ok: false,
      bodyPreview: `exceção: ${(e as Error).message}`,
    }));

    const tokenPrefix = token.slice(0, 8);
    auditLog(
      `Probe: ${provider.name} (token ${tokenPrefix}…) → HTTP ${probe.status ?? 'erro'} ${probe.ok ? 'OK ✅' : 'FALHOU'} — ${probe.bodyPreview.slice(0, 120)}`,
    );
    results.push({ provider: provider.name, token: tokenPrefix, ...probe });
  }

  const winner = results.find(r => r.ok);
  if (winner) {
    auditLog(`Probe: ✅ CONCLUSÃO — token de '${winner.provider}' é aceito no serviço de ponto. Import deve funcionar com ele.`);
  } else {
    auditLog('Probe: ❌ CONCLUSÃO — nenhuma fonte de token foi aceita. É problema de escopo/permissão, não de "achar token".');
  }
  return results;
}

/**
 * Dry-run READ-ONLY do fluxo de batida: roda o registrar de produção com
 * dryRun=true — config, assinatura e montagem do payload acontecem de verdade,
 * mas o POST de import NÃO é enviado. Prova que tudo até a escrita funciona,
 * sem registrar ponto. Usa a MESMA cadeia de auth da batida real.
 */
export async function probePunchDryRun(): Promise<PunchResult> {
  auditLog('Dry-run: montando a batida completa SEM enviar o import...');

  const providers: IAuthProvider[] = [
    new SeniorPageAuth(),
    new SeniorInterceptorAuth(),
    new SeniorTokenStorageAuth(),
  ];

  let token: string | null = null;
  let via = '';
  for (const p of providers) {
    token = await p.getAccessToken().catch(() => null);
    if (token) { via = p.name; break; }
  }
  if (!token) {
    auditLog('Dry-run: nenhuma fonte deu token — abra o Senior logado e rode de novo');
    return { success: false, logs: ['sem token'] };
  }
  auditLog(`Dry-run: usando token de '${via}' (${token.slice(0, 8)}…)`);

  const result = await new SeniorPunchRegistrar().registerPunch(token, { dryRun: true });
  result.logs.forEach(l => auditLog(`Dry-run: ${l}`));
  if (result.success) {
    auditLog('Dry-run: ✅ fluxo inteiro OK até o import. Só falta o POST real — que uma batida de verdade faria.');
  } else {
    auditLog(`Dry-run: ❌ falhou antes do import — ${result.logs.join(' | ')}`);
  }
  return result;
}

/**
 * Injeta na aba Senior (world MAIN) e faz UMA chamada POST de leitura ao config.
 * Roda no contexto da página porque é lá que o CORS/origin do Senior é aceito —
 * mesmo caminho do registrar, mas sem o passo de import.
 */
async function callConfig(
  tabId: number,
  token: string,
): Promise<{ status: number | null; ok: boolean; bodyPreview: string }> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [token, CONFIG_URL],
    func: async (t: string, url: string) => {
      const H = { Authorization: `bearer ${t}`, 'Content-Type': 'application/json' };
      try {
        const r = await fetch(url, { method: 'POST', headers: H, body: '{}' });
        const text = await r.text();
        return { status: r.status, ok: r.ok, bodyPreview: text.slice(0, 300) };
      } catch (e) {
        return { status: null, ok: false, bodyPreview: `fetch erro: ${(e as Error).message}` };
      }
    },
  });
  return results?.[0]?.result ?? { status: null, ok: false, bodyPreview: 'sem resultado do executeScript' };
}
