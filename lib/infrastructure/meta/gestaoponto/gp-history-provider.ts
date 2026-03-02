import type { DayRecord, HourBankBalance } from '../../../domain/types';
import { calcWorkedMinutes } from '../../../application/calc-hour-bank';
import { getGpAssertion } from './gp-auth';
import { GP_API_BASE } from './constants';

interface GpPeriodInfo {
  codigoCalculo: number;
  inicioApuracao: string;
  fimApuracao: string;
}

export interface GpHistoryResult {
  records: DayRecord[];
  balance: HourBankBalance;
}

const HEADERS = (assertion: string) => ({
  'Accept': 'application/json',
  'assertion': assertion,
  'zone-offset': String(new Date().getTimezoneOffset()),
});

async function fetchPeriodForCompetencia(colaboradorId: string, assertion: string, competencia: string): Promise<GpPeriodInfo | null> {
  const url = `${GP_API_BASE}codigos-calculo/buscar-codigo-calculo-competencia?colaborador=${colaboradorId}&competencia=${competencia}&isTelaColaborador=S`;
  try {
    const r = await fetch(url, { headers: HEADERS(assertion) });
    if (!r.ok) return null;
    const json = await r.json();
    const cc = json.result?.codigoCalculo;
    if (!cc) return null;
    return { codigoCalculo: cc.codigoCalculo, inicioApuracao: cc.inicioApuracao, fimApuracao: cc.fimApuracao };
  } catch { return null; }
}


async function fetchHistory(colaboradorId: string, assertion: string, codigoCalculo: number, dataInicial: string, dataFinal: string): Promise<Record<string, unknown> | null> {
  const url = `${GP_API_BASE}acertoPontoColaboradorPeriodo/colaborador/${colaboradorId}?codigoCalculo=${codigoCalculo}&dataInicial=${dataInicial}&dataFinal=${dataFinal}&orderby=-dataApuracao`;
  try {
    const r = await fetch(url, { headers: HEADERS(assertion) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function parseHourMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function calcExpectedMinutes(marcacoesPrevistas: string[]): number {
  if (!marcacoesPrevistas || marcacoesPrevistas.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < marcacoesPrevistas.length - 1; i += 2) {
    const start = parseHourMin(marcacoesPrevistas[i]);
    const end = parseHourMin(marcacoesPrevistas[i + 1]);
    total += end - start;
  }
  return total;
}

function parseRecords(json: Record<string, unknown>): DayRecord[] {
  const apuracao = json.apuracao as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(apuracao)) return [];
  const records: DayRecord[] = [];
  for (const dia of apuracao) {
    const date = dia.dataApuracao as string;
    const marcacoes = (dia.marcacoes || []) as Array<Record<string, string>>;
    const punches = marcacoes
      .map(m => m.horaAcesso?.match(/(\d{2}:\d{2})/)?.[1])
      .filter((t): t is string => !!t)
      .sort();
    const workedMinutes = calcWorkedMinutes(punches);
    const marcacoesPrevistas = (dia.marcacoesPrevistas || []) as string[];
    const expectedMinutes = calcExpectedMinutes(marcacoesPrevistas);
    const TOLERANCE = 10;
    const diff = workedMinutes - expectedMinutes;
    const balanceMinutes = Math.abs(diff) <= TOLERANCE ? 0 : diff;
    records.push({ date, punches, workedMinutes, balanceMinutes });
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getWorkedHoursForDate(dateStr: string): Promise<number | null> {
  const auth = await getGpAssertion();
  if (!auth?.assertion || !auth.colaboradorId) return null;
  const [y, m] = dateStr.split('-');
  const comp = `${y}-${m}-01`;
  const period = await fetchPeriodForCompetencia(auth.colaboradorId, auth.assertion, comp);
  if (!period) return null;
  const json = await fetchHistory(auth.colaboradorId, auth.assertion, period.codigoCalculo, dateStr, dateStr);
  if (!json) return null;
  const records = parseRecords(json);
  const record = records.find(r => r.date === dateStr);
  if (!record || record.workedMinutes === 0) return null;
  console.log(`[Senior Ponto] GP horas para ${dateStr}: ${record.workedMinutes}min (${(record.workedMinutes / 60).toFixed(2)}h)`);
  return record.workedMinutes / 60;
}

export async function fetchGpHistoryForPeriod(monthOffset: number): Promise<GpHistoryResult | null> {
  const auth = await getGpAssertion();
  if (!auth?.assertion || !auth.colaboradorId) return null;

  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const comp = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-01`;
  let period = await fetchPeriodForCompetencia(auth.colaboradorId, auth.assertion, comp);

  if (!period && monthOffset === 0) {
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const nextComp = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
    period = await fetchPeriodForCompetencia(auth.colaboradorId, auth.assertion, nextComp);
  }

  if (monthOffset === 0 && period) {
    const today = new Date().toISOString().split('T')[0];
    if (period.fimApuracao < today) {
      const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
      const nextComp = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
      const nextPeriod = await fetchPeriodForCompetencia(auth.colaboradorId, auth.assertion, nextComp);
      if (nextPeriod) period = nextPeriod;
    }
  }

  if (!period) return null;

  const json = await fetchHistory(auth.colaboradorId, auth.assertion, period.codigoCalculo, period.inicioApuracao, period.fimApuracao);
  if (!json) return null;

  const records = parseRecords(json);
  const today = new Date().toISOString().split('T')[0];
  const totalMinutes = records.filter(r => r.date !== today).reduce((sum, r) => sum + r.balanceMinutes, 0);

  return {
    records,
    balance: {
      totalMinutes,
      periodStart: period.inicioApuracao,
      periodEnd: period.fimApuracao,
      carryOverMinutes: 0,
    },
  };
}

