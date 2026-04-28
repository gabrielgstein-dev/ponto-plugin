// Period da Meta segue ciclo fiscal: dia 26 do mês N-1 até dia 25 do mês N
// pertencem ao period N. Ex.: 2026-04-27 → period "2026-05".
export function getCurrentTimesheetPeriod(offset = 0, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d.getDate() >= 26) d.setMonth(d.getMonth() + 1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
