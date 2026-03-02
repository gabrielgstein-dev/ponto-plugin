import type { HourBankBalance } from '../../domain/types';
import { formatDiff, formatDateShort } from '../../domain/time-utils';
import { calcZeroBankExitTime } from '../../application/calc-hour-bank';

interface HourBankBannerProps {
  balance: HourBankBalance | null;
  estimatedExit: string | null;
}

async function openSidePanel() {
  const win = await chrome.windows.getCurrent();
  if (win.id != null) chrome.sidePanel.open({ windowId: win.id });
}

export function HourBankBanner({ balance, estimatedExit }: HourBankBannerProps) {
  if (!balance) {
    return (
      <div className="hour-bank-banner">
        <div className="hour-bank-header">
          <span className="hour-bank-label">Banco de Horas</span>
          <button className="hour-bank-detail-btn" onClick={openSidePanel}>Ver completo →</button>
        </div>
      </div>
    );
  }

  const isPositive = balance.totalMinutes >= 0;
  const className = `hour-bank-banner ${isPositive ? 'positive' : 'negative'}`;
  const zeroBankExit = calcZeroBankExitTime(estimatedExit, balance.totalMinutes);

  return (
    <div className={className}>
      <div className="hour-bank-header">
        <span className="hour-bank-label">Banco de Horas</span>
        <span className="hour-bank-value">{formatDiff(balance.totalMinutes)}</span>
      </div>
      {zeroBankExit && (
        <div className="hour-bank-hint">
          Saia às <strong>{zeroBankExit}</strong> para zerar o banco
        </div>
      )}
      <div className="hour-bank-footer">
        <span className="hour-bank-period">
          Período: {formatDateShort(balance.periodStart)} — {formatDateShort(balance.periodEnd)}
        </span>
        <button className="hour-bank-detail-btn" onClick={openSidePanel}>Ver completo →</button>
      </div>
    </div>
  );
}

