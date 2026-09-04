interface ProgressBarProps {
  workedMinutes: number;
  totalMinutes: number;
  showOvertime?: boolean;
}

export function ProgressBar({ workedMinutes, totalMinutes, showOvertime = true }: ProgressBarProps) {
  const isOvertime = workedMinutes > totalMinutes;
  const displayMinutes = Math.min(workedMinutes, totalMinutes);
  // `totalMinutes` deixou de ser fixo (jornada + hora extra do dia): meta zero
  // dividiria por zero e pintaria `NaN%` na barra.
  const pct = totalMinutes > 0 ? Math.min(100, Math.round((displayMinutes / totalMinutes) * 100)) : 0;
  
  const hours = Math.floor(displayMinutes / 60);
  const mins = displayMinutes % 60;
  // A meta pode ter minutos quebrados (jornada + hora extra em passos de 15min),
  // então `8h15` não pode ser exibida como `8h`.
  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  const totalLabel = totalM === 0 ? `${totalH}h` : `${totalH}h${String(totalM).padStart(2, '0')}`;
  const label = `${hours}h${String(mins).padStart(2, '0')} / ${totalLabel}`;

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
