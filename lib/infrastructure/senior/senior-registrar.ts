import type { IPunchRegistrar } from '../../domain/interfaces';
import type { PunchResult } from '../../domain/types';
import { findSeniorTab } from './tab-utils';
import { debugLog } from '../../domain/debug';

const BASE = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest';
const PUNCH_URL = `${BASE}/hcm/pontomobile_clocking_event/actions/clockingEventImportByBrowser`;
const CONFIG_URL = `${BASE}/hcm/pontomobile_bff/queries/getEmployeeClockingConfigQuery`;

export class SeniorPunchRegistrar implements IPunchRegistrar {
  /**
   * @param opts.dryRun quando true, executa TODO o fluxo (config, assinatura,
   *   montagem do payload) mas NÃO faz o POST de import — não registra ponto.
   *   Serve pra validar o caminho de escrita sem sujar o cartão. Usa o mesmo
   *   código de produção de propósito: o que roda no dry-run é o que roda pra
   *   valer, menos a última linha.
   */
  async registerPunch(accessToken: string, opts?: { dryRun?: boolean }): Promise<PunchResult> {
    const tab = await findSeniorTab();
    if (!tab?.id) return { success: false, logs: ['Nenhuma aba Senior encontrada'] };

    const dryRun = opts?.dryRun === true;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [accessToken, CONFIG_URL, PUNCH_URL, dryRun],
      func: async (token: string, configUrl: string, punchUrl: string, dryRun: boolean) => {
        const H: Record<string, string> = { 'Authorization': `bearer ${token}`, 'Content-Type': 'application/json' };
        const logs: string[] = [];
        const log = (msg: string) => logs.push(msg);

        log('Buscando config do colaborador...');
        let config: Record<string, unknown> | null = null;
        try {
          const r = await fetch(configUrl, { method: 'POST', headers: H, body: '{}' });
          if (!r.ok) return { success: false, logs: [...logs, `Config falhou: ${r.status}`] };
          const body = await r.json();
          config = body.employeeClockingConfig;
          log('Config OK');
        } catch (e: unknown) {
          return { success: false, logs: [...logs, `Config erro: ${(e as Error).message}`] };
        }

        if (!config || !config.employee) return { success: false, logs: [...logs, 'Sem config do colaborador'] };

        const emp = config.employee as Record<string, unknown>;
        const comp = (emp.company || config.company) as Record<string, unknown>;
        if (!comp) return { success: false, logs: [...logs, 'Sem dados da empresa'] };

        const tz = (config.timeZone as string) || 'America/Sao_Paulo';
        const useCode = (config.clockingEventUses as Array<Record<string, string>>)?.[0]?.code || '02';

        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const clientDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        log('Gerando signature...');
        const signInput = `${emp.pis}${comp.cnpj || comp.identifier || ''}${clientDateTime}`;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(signInput));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        const signatureB64 = btoa(hashHex);

        const clockingInfo: Record<string, unknown> = {
          company: { id: comp.id, arpId: comp.arpId, identifier: comp.cnpj || comp.identifier, caepf: comp.caepf || '0', cnoNumber: comp.cnoNumber || '0' },
          employee: { id: emp.id, arpId: emp.arpId, cpf: emp.cpf, pis: emp.pis },
          appVersion: '3.22.1',
          timeZone: tz,
          skipValidation: false,
          clientDateTimeEvent: clientDateTime,
          signature: { signatureVersion: 1, signature: signatureB64 },
          use: useCode,
        };

        if (dryRun) {
          // Chegou aqui = config 200, empresa/colaborador presentes, assinatura
          // gerada e payload montado. Só falta o POST — que NÃO fazemos.
          // Log sem PII crua: confirma presença dos campos, não os valores.
          const ok = {
            'company.id': !!comp.id,
            'employee.id': !!emp.id,
            'employee.pis': !!emp.pis,
            'signature.len': signatureB64.length,
            use: useCode,
            clientDateTime,
          };
          log(`DRY-RUN: fluxo completo até o import. Payload pronto: ${JSON.stringify(ok)}`);
          log('DRY-RUN: POST de import NÃO enviado (nenhum ponto registrado).');
          return { success: true, logs, responseBody: 'dry-run' };
        }

        async function tryPunch(label: string, info: Record<string, unknown>) {
          log(label);
          try {
            const r = await fetch(punchUrl, { method: 'POST', headers: H, body: JSON.stringify({ clockingInfo: info }) });
            const b = await r.text();
            log(`${label} → ${r.status}`);
            if (r.ok || r.status === 201 || r.status === 202) {
              // HTTP 2xx NÃO basta: o Senior responde 200 com corpo de erro de
              // negócio (duplicata, validação) e antes disso era tratado como
              // sucesso — origem das "batidas fantasma" (plugin dizia que bateu,
              // histórico do Senior vazio). Só é sucesso se o corpo trouxer o
              // evento importado de volta.
              let imported: unknown = null;
              try {
                imported = JSON.parse(b)?.clockingResult?.clockingEventImported ?? null;
              } catch (_) { /* corpo não-JSON → sem confirmação */ }
              if (imported) {
                return { success: true, logs, responseBody: b.substring(0, 500) };
              }
              // Corpo vai pro log: é a única pista de POR QUE o Senior recusou.
              log(`${label} → 2xx SEM clockingEventImported (recusa de negócio). Corpo: ${b.substring(0, 300)}`);
              return null;
            }
            log(`${label} → corpo: ${b.substring(0, 300)}`);
          } catch (e: unknown) { log(`Erro: ${(e as Error).message}`); }
          return null;
        }

        const attempts: Array<{ label: string; mutate: () => void }> = [
          { label: 'Enviando ponto...', mutate: () => {} },
          { label: 'Tentando com skipValidation=true...', mutate: () => { clockingInfo.skipValidation = true; } },
          { label: 'Tentando sem signature...', mutate: () => { delete clockingInfo.signature; clockingInfo.skipValidation = false; } },
        ];

        for (const attempt of attempts) {
          attempt.mutate();
          const result = await tryPunch(attempt.label, clockingInfo);
          if (result) return result;
        }

        return { success: false, logs };
      },
    });

    const result = results?.[0]?.result;
    if (result?.logs) result.logs.forEach((l: string) => debugLog(l));
    return result ?? { success: false, logs: ['executeScript sem resultado'] };
  }
}
