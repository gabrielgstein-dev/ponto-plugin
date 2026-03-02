interface ProgressBarProps {
  workedMinutes: number;
  totalMinutes: number;
}

export function ProgressBar({ workedMinutes, totalMinutes }: ProgressBarProps) {
  const pct = Math.min(100, Math.round((workedMinutes / totalMinutes) * 100));
  const hours = Math.floor(workedMinutes / 60);
  const mins = workedMinutes % 60;
  const label = `${hours}h${String(mins).padStart(2, '0')} / ${Math.floor(totalMinutes / 60)}h`;

  return (
    <div className="progress-section">
      <div className="progress-label">
        <span>Jornada</span>
        <span>{label}</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-pct">{pct}%</div>
    </div>
  );
}
