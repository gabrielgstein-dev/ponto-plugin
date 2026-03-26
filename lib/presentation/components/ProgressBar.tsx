interface ProgressBarProps {
  workedMinutes: number;
  totalMinutes: number;
  showOvertime?: boolean;
}

export function ProgressBar({ workedMinutes, totalMinutes, showOvertime = true }: ProgressBarProps) {
  const isOvertime = workedMinutes > totalMinutes;
  const displayMinutes = Math.min(workedMinutes, totalMinutes);
  const pct = Math.min(100, Math.round((displayMinutes / totalMinutes) * 100));
  
  const hours = Math.floor(displayMinutes / 60);
  const mins = displayMinutes % 60;
  const label = `${hours}h${String(mins).padStart(2, '0')} / ${Math.floor(totalMinutes / 60)}h`;

  const overtimeMinutes = isOvertime && showOvertime ? workedMinutes - totalMinutes : 0;
  const overtimeHours = Math.floor(overtimeMinutes / 60);
  const overtimeMins = overtimeMinutes % 60;

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
      
      {overtimeMinutes > 0 && (
        <div className="overtime-section">
          <span className="overtime-icon">⏱️</span>
          <span className="overtime-label">Hora Extra</span>
          <span className="overtime-value">+{overtimeHours}h{String(overtimeMins).padStart(2, '0')}</span>
        </div>
      )}
    </div>
  );
}
