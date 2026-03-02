import { useState, useEffect } from 'react';
import { getManualPunchHistory } from '../../infrastructure/manual/manual-punch-provider';
import { seedMockPunches } from '../../infrastructure/manual/seed-mock-punches';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = WEEKDAYS[date.getDay()];
  return `${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function calcWorked(times: string[]): string {
  if (times.length < 2) return '--';
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const first = toMin(times[0]);
  const last = toMin(times[times.length - 1]);
  let lunch = 0;
  if (times.length >= 4) {
    lunch = toMin(times[2]) - toMin(times[1]);
  }
  const worked = last - first - lunch;
  const h = Math.floor(worked / 60);
  const m = worked % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

interface PunchHistoryProps {
  showSeedButton?: boolean;
}

export function PunchHistory({ showSeedButton }: PunchHistoryProps) {
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState(false);

  const load = () => getManualPunchHistory().then(setHistory);

  useEffect(() => { load(); }, []);

  const days = Object.keys(history).sort().reverse();

  return (
    <div className="history-section">
      <button className="history-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▲ Fechar Histórico' : '📋 Histórico (7 dias)'}
      </button>
      {open && (
        <div className="history-body">
          {days.length === 0 && <div className="history-empty">Nenhum registro encontrado</div>}
          {days.map(date => (
            <div key={date} className="history-row">
              <div className="history-header">
                <span className="history-date">{formatDateLabel(date)}</span>
                <span className="history-worked">{calcWorked(history[date])}</span>
              </div>
              <span className="history-times">{history[date].join('  →  ')}</span>
            </div>
          ))}
          {showSeedButton && (
            <button className="seed-btn" onClick={() => seedMockPunches().then(load)}>
              Gerar dados mock (7 dias)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
