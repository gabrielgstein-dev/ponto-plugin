interface PunchCardProps {
  label: string;
  icon: string;
  time: string | null;
  subtitle: string;
  isCalc: boolean;
  isPast: boolean;
  isNext: boolean;
  /** Slot com batida automática ligada — ganha marca ⚡ para distinguir do manual. */
  isAuto?: boolean;
  /**
   * O plugin não conseguiu consultar nenhuma fonte (sem auth). Sem isso o card
   * mostrava `--:--`, que se lê como "não bateu" — e levou a bater em
   * duplicidade um ponto que já existia no servidor.
   */
  unknown?: boolean;
}

export function PunchCard({ label, icon, time, subtitle, isCalc, isPast, isNext, isAuto, unknown }: PunchCardProps) {
  let timeClass = 'card-time';
  if (isCalc) timeClass += ' calc';
  else if (isPast) timeClass += ' past';
  else if (isNext) timeClass += ' next';

  // Cego E sem horário conhecido: dizer "não sei", não "não bateu".
  const isUnknown = unknown === true && !time;
  if (isUnknown) timeClass = 'card-time unknown';

  return (
    <div className={`punch-card ${isPast ? 'done' : ''} ${isAuto ? 'auto' : ''} ${isUnknown ? 'unknown' : ''}`}>
      {isAuto && (
        <span className="card-auto-badge" title="Batida automática ligada" aria-label="Batida automática ligada">⚡</span>
      )}
      <div className="card-icon">{icon}</div>
      <div className="card-info">
        <div className="card-label">{label}</div>
        <div className={timeClass}>{isUnknown ? '??:??' : (time ?? '--:--')}</div>
        <div className="card-sub">{isUnknown ? 'sem dados' : subtitle}</div>
      </div>
    </div>
  );
}
