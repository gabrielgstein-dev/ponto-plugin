export type PaytrackTone = 'normal' | 'attention' | 'warning' | 'urgent';

export interface PaytrackStatus {
  tone: PaytrackTone;
  label: string;
  daysLeft: number | null;
}

const PAYTRACK_DEADLINE_DAY = 10;

const MONTH_ABBR_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function nextDeadlineLabel(now: Date): string {
  const isThisMonthStillOpen = now.getDate() <= PAYTRACK_DEADLINE_DAY;
  const targetMonth = isThisMonthStillOpen ? now.getMonth() : (now.getMonth() + 1) % 12;
  return `Próximo prazo: ${PAYTRACK_DEADLINE_DAY}/${MONTH_ABBR_PT[targetMonth]}`;
}

export function getPaytrackStatus(now: Date = new Date()): PaytrackStatus {
  const day = now.getDate();

  if (day === PAYTRACK_DEADLINE_DAY) {
    return { tone: 'urgent', label: 'ÚLTIMO DIA', daysLeft: 0 };
  }

  if (day >= 7 && day <= 9) {
    const daysLeft = PAYTRACK_DEADLINE_DAY - day;
    return {
      tone: 'warning',
      label: daysLeft === 1 ? 'Falta 1 dia' : `Faltam ${daysLeft} dias`,
      daysLeft,
    };
  }

  if (day >= 4 && day <= 6) {
    const daysLeft = PAYTRACK_DEADLINE_DAY - day;
    return { tone: 'attention', label: `Faltam ${daysLeft} dias`, daysLeft };
  }

  return { tone: 'normal', label: nextDeadlineLabel(now), daysLeft: null };
}

export const PAYTRACK_URL = 'https://app.paytrack.com.br/#/dashboard/colaborador';
