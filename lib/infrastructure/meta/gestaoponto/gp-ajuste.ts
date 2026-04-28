import { getGpAssertion } from './gp-auth';
import { GP_API_BASE } from './constants';
import { debugLog, debugWarn } from '../../../domain/debug';

export const JUSTIFICATIVAS = [
  { codigo: 1, descricao: 'Ausência de Acesso' },
  { codigo: 2, descricao: 'Sem Internet' },
  { codigo: 3, descricao: 'Em deslocamento' },
  { codigo: 4, descricao: 'Esquecimento de registro' },
  { codigo: 5, descricao: 'Registro duplicado' },
  { codigo: 6, descricao: 'Marcação indevida' },
] as const;

export type JustificativaCodigo = 1 | 2 | 3 | 4 | 5 | 6;

interface GpDayRaw {
  marcacoes: Record<string, unknown>[];
  hashDB: string;
}

const HEADERS = (assertion: string) => ({
  'Accept': 'application/json',
  'assertion': assertion,
  'zone-offset': String(new Date().getTimezoneOffset()),
});

async function fetchDayRaw(
  colaboradorId: string,
  assertion: string,
  codigoCalculo: string,
  dateStr: string,
): Promise<GpDayRaw | null> {
  const url = `${GP_API_BASE}acertoPontoColaboradorPeriodo/colaborador/${colaboradorId}?dataInicial=${dateStr}&dataFinal=${dateStr}&orderby=-dataApuracao&codigoCalculo=${codigoCalculo}`;
  try {
    const r = await fetch(url, { headers: HEADERS(assertion) });
    if (!r.ok) return null;
    const json = await r.json();
    const apuracao = json.apuracao as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(apuracao) || apuracao.length === 0) return null;
    const dia = apuracao.find(d => d.dataApuracao === dateStr) ?? apuracao[0];
    const marcacoes = (dia.marcacoes as Record<string, unknown>[]) ?? [];
    const hashDB = (dia.hashDB ?? dia.hash ?? '') as string;
    debugLog('GP ajuste fetchDayRaw hashDB:', hashDB, 'marcacoes:', marcacoes.length);
    return { marcacoes, hashDB };
  } catch (e) {
    debugWarn('GP ajuste fetchDayRaw erro:', (e as Error).message);
    return null;
  }
}

function buildCracha(colaboradorId: string): number {
  // "1410-1-35829" → empresa=1410, cadastro=35829 → cracha=141000035829
  const parts = colaboradorId.split('-');
  const empresa = parts[0];
  const cadastro = parts[parts.length - 1];
  return parseInt(empresa.padStart(4, '0') + cadastro.padStart(8, '0'), 10);
}

export async function addGpPunchAjuste(
  dateStr: string,
  horaAcesso: string,
  justificativaCodigo: JustificativaCodigo,
): Promise<{ ok: boolean; message: string }> {
  const auth = await getGpAssertion();
  if (!auth?.assertion || !auth.colaboradorId || !auth.codigoCalculo) {
    return { ok: false, message: 'Sem autenticação. Acesse o Gestão Ponto primeiro.' };
  }

  const { colaboradorId, assertion, codigoCalculo } = auth;
  const dayData = await fetchDayRaw(colaboradorId, assertion, codigoCalculo, dateStr);
  if (!dayData) {
    return { ok: false, message: 'Não foi possível carregar os dados do dia.' };
  }

  const justificativa = JUSTIFICATIVAS.find(j => j.codigo === justificativaCodigo)!;

  // Add selectedUse to existing punches if missing (GP frontend requirement)
  const selectedUse = { codigo: 2, descricao: 'Marcação de Ponto' };
  const existingMarcacoes = dayData.marcacoes.map(m => ({
    ...m,
    selectedUse: m.selectedUse ?? selectedUse,
  }));

  const newPunch = {
    dataAcesso: dateStr,
    dataApuracao: dateStr,
    horaAcesso,
    justificativa: { codigo: justificativaCodigo, descricao: justificativa.descricao, id: String(justificativaCodigo) },
    uso: 2,
    selectedUse,
    origem: 'D',
    tipoAcesso: 1,
    tipoColaborador: 1,
    __new: true,
    sequencia: 1,
    funcao: { codigo: 0 },
    fusMar: new Date().getTimezoneOffset() / -60,
    numeroCadastro: parseInt(colaboradorId.split('-').pop()!, 10),
    numeroEmpresa: parseInt(colaboradorId.split('-')[0], 10),
    cracha: buildCracha(colaboradorId),
  };

  const payload = {
    movidasDiaPosterior: [],
    movidasDiaAnterior: [],
    excluidas: [],
    marcacoes: [...existingMarcacoes, newPunch],
  };

  let url = `${GP_API_BASE}colaboradores/${colaboradorId}/apuracoes/${dateStr}/marcacoes/lote?codigoCalculo=${codigoCalculo}`;
  if (dayData.hashDB) url += `&hashDB=${encodeURIComponent(dayData.hashDB)}`;

  debugLog('GP ajuste POST:', url, 'marcacoes:', payload.marcacoes.length);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        'assertion': assertion,
        'origin': 'https://gestaoponto.meta.com.br',
      },
      body: JSON.stringify(payload),
    });
    const json = await r.json();
    if (r.ok && json.codigo === 200) {
      debugLog('GP ajuste OK:', json.mensagens);
      return { ok: true, message: json.mensagens?.[0] ?? 'Marcação salva com sucesso.' };
    }
    debugWarn('GP ajuste falhou:', json);
    return { ok: false, message: json.mensagens?.[0] ?? `Erro ${r.status} ao salvar marcação.` };
  } catch (e) {
    debugWarn('GP ajuste erro:', (e as Error).message);
    return { ok: false, message: 'Erro de conexão ao salvar marcação.' };
  }
}
