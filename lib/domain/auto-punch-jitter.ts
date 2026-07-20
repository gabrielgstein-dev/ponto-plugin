import type { PunchReminderSlot } from './types';

export type SlotOffsets = Record<PunchReminderSlot, number>;

// Range de deslocamento por batida (minutos). Sempre POSITIVO: a batida sai
// depois do horário nominal, nunca antes — não há como "bater no passado" e
// atrasar levemente é o comportamento humano típico.
export const OFFSET_MIN = 1;
export const OFFSET_MAX = 8;

// Desvio máximo do total trabalhado que ainda é absorvido pela apuração.
// A apuração zera o saldo quando |trabalhado − previsto| ≤ 10min (TOLERANCE em
// gp-history-provider.ts). Mantemos 9 pra ficar SEMPRE dentro da tolerância,
// com folga de 1min. O desvio é sempre ≤ 0 (nunca reivindica trabalho a mais).
export const MAX_WORKED_UNDER = 9;

/**
 * worked = (almoco − entrada) + (saida − volta). Como cada batida ganha um
 * offset, o desvio do total trabalhado em relação ao nominal é:
 *   (almoco − entrada) + (saida − volta)  aplicado aos OFFSETS.
 */
export function computeWorkedDelta(offsets: SlotOffsets): number {
  return (offsets.almoco - offsets.entrada) + (offsets.saida - offsets.volta);
}

/**
 * Sorteia um offset (em minutos) por slot de forma que:
 *  - cada offset ∈ [OFFSET_MIN, OFFSET_MAX] e ≠ 0 (garante minuto não-nominal);
 *  - o desvio do total trabalhado ∈ [−MAX_WORKED_UNDER, 0] (absorvido pela
 *    tolerância de apuração → saldo 0, e nunca a mais).
 *
 * Usa rejection sampling: sorteia os 4 offsets e reprova quem cair fora do
 * invariante. É simples e obviamente correto; a probabilidade de aceitar é
 * alta, então poucas iterações bastam. O fallback determinístico ao fim já
 * satisfaz o invariante e nunca deve ser alcançado na prática.
 *
 * `rng` é injetável para tornar o gerador determinístico nos testes.
 */
export function generateDailyOffsets(rng: () => number = Math.random): SlotOffsets {
  const randOffset = () => OFFSET_MIN + Math.floor(rng() * (OFFSET_MAX - OFFSET_MIN + 1));

  for (let i = 0; i < 200; i++) {
    const offsets: SlotOffsets = {
      entrada: randOffset(),
      almoco: randOffset(),
      volta: randOffset(),
      saida: randOffset(),
    };
    const delta = computeWorkedDelta(offsets);
    if (delta >= -MAX_WORKED_UNDER && delta <= 0) return offsets;
  }

  // Fallback: (2−4)+(2−4) = −4 ∈ [−9, 0]. Determinístico e válido.
  return { entrada: 4, almoco: 2, volta: 4, saida: 2 };
}
