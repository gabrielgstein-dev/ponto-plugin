interface PunchCardProps {
  label: string;
  icon: string;
  time: string | null;
  subtitle: string;
  isCalc: boolean;
  isPast: boolean;
  isNext: boolean;
}

export function PunchCard({ label, icon, time, subtitle, isCalc, isPast, isNext }: PunchCardProps) {
  let timeClass = 'card-time';
  if (isCalc) timeClass += ' calc';
  else if (isPast) timeClass += ' past';
  else if (isNext) timeClass += ' next';

  return (
    <div className={`punch-card ${isPast ? 'done' : ''}`}>
      <div className="card-icon">{icon}</div>
      <div className="card-info">
        <div className="card-label">{label}</div>
        <div className={timeClass}>{time ?? '--:--'}</div>
        <div className="card-sub">{subtitle}</div>
      </div>
    </div>
  );
}
