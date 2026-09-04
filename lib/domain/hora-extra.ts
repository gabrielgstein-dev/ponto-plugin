/**
 * Hora extra do dia — quanto a mais (ou a menos) trabalhar HOJE, em minutos.
 *
 * É um DELTA sobre `settings.jornada`, não um total. Contrato de 6h com +1h de
 * extra vira alvo de 7h; o mesmo +1h num contrato de 8h vira 9h. Tratar como
 * total obrigaria o usuário a saber a própria jornada de cor e mudaria de
 * significado a cada contrato.
 *
 * O que este módulo NÃO faz: mexer no saldo do banco de horas. A jornada
 * contratual (`settings.jornada`) continua sendo o previsto na apuração — é
 * justamente por isso que um dia de +1h aparece como +1h de saldo. Ver
 * `buildDayRecord` em application/calc-hour-bank.ts.
 */

/** Teto: 2h/dia é o limite legal de horas extras (CLT art. 59). */
export const HORA_EXTRA_MAX = 120;

/** Piso simétrico: cobre o inverso — sair mais cedo para compensar. */
export const HORA_EXTRA_MIN = -120;

/** Granularidade do controle na UI. */
export const HORA_EXTRA_STEP = 15;

/**
 * Prende o valor na faixa permitida e no passo. Entrada inválida (null, NaN,
 * string que veio de storage corrompido) vira 0 — sem override.
 */
export function clampHoraExtra(minutes: unknown): number {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return 0;
  const stepped = Math.round(minutes / HORA_EXTRA_STEP) * HORA_EXTRA_STEP;
  return Math.min(HORA_EXTRA_MAX, Math.max(HORA_EXTRA_MIN, stepped));
}

/**
 * Jornada-alvo de hoje: contrato + extra, nunca negativa.
 *
 * É o único número que o cálculo de horário de saída deve usar — e, por tabela,
 * o que define o alarme `autopunch_saida`, o lembrete e o countdown.
 */
export function jornadaAlvo(jornadaContratual: number, horaExtra: unknown): number {
  return Math.max(0, jornadaContratual + clampHoraExtra(horaExtra));
}

/** "+1h30", "−45min", "" (quando zero). Usado no rótulo do controle. */
export function formatHoraExtra(minutes: number): string {
  const m = clampHoraExtra(minutes);
  if (m === 0) return '';
  const sign = m > 0 ? '+' : '−';
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  if (h === 0) return `${sign}${min}min`;
  if (min === 0) return `${sign}${h}h`;
  return `${sign}${h}h${String(min).padStart(2, '0')}`;
}
