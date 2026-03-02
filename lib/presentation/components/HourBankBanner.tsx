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
  window.close();
}

export function HourBankBanner({ balance, estimatedExit }: HourBankBannerProps) {
  if (!balance) {
    return (
      <div className="hour-bank-banner" style={{ cursor: 'pointer' }} onClick={openSidePanel}>
        <div className="hour-bank-header">
          <span className="hour-bank-label">Histórico & Timesheet</span>
          <span className="hour-bank-detail-btn">Abrir →</span>
        </div>
      </div>
    );
  }

  const isPositive = balance.totalMinutes >= 0;
  const className = `hour-bank-banner ${isPositive ? 'positive' : 'negative'}`;
  const zeroBankExit = calcZeroBankExitTime(estimatedExit, balance.totalMinutes);

  return (
    <div className={className} style={{ cursor: 'pointer' }} onClick={openSidePanel}>
      <div className="hour-bank-header">
        <span className="hour-bank-label">Histórico & Timesheet</span>
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
        <span className="hour-bank-detail-btn">Abrir →</span>
      </div>
    </div>
  );
}

