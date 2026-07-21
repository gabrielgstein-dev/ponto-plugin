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
}

export function PunchCard({ label, icon, time, subtitle, isCalc, isPast, isNext, isAuto }: PunchCardProps) {
  let timeClass = 'card-time';
  if (isCalc) timeClass += ' calc';
  else if (isPast) timeClass += ' past';
  else if (isNext) timeClass += ' next';

  return (
    <div className={`punch-card ${isPast ? 'done' : ''} ${isAuto ? 'auto' : ''}`}>
      {isAuto && (
        <span className="card-auto-badge" title="Batida automática ligada" aria-label="Batida automática ligada">⚡</span>
      )}
      <div className="card-icon">{icon}</div>
      <div className="card-info">
        <div className="card-label">{label}</div>
        <div className={timeClass}>{time ?? '--:--'}</div>
        <div className="card-sub">{subtitle}</div>
      </div>
    </div>
  );
}
