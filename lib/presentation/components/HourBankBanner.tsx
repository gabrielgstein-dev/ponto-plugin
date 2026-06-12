import type { HourBankBalance } from '../../domain/types';
import { formatDiff, formatDateShort } from '../../domain/time-utils';
import { calcZeroBankExitTime } from '../../application/calc-hour-bank';
import { openMainSidePanel } from '../sidepanel-switch';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

interface HourBankBannerProps {
  balance: HourBankBalance | null;
  estimatedExit: string | null;
}

async function openSidePanel() {
  await openMainSidePanel();
  window.close();
}

function BannerTitle({ showTimesheet }: { showTimesheet: boolean }) {
  return (
    <div className="hour-bank-title">
      <span className="hour-bank-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M7 16v-5" />
          <path d="M12 16V8" />
          <path d="M17 16v-3" />
        </svg>
      </span>
      <span className="hour-bank-label">{showTimesheet ? 'Histórico & Timesheet' : 'Histórico'}</span>
    </div>
  );
}

export function HourBankBanner({ balance, estimatedExit }: HourBankBannerProps) {
  const { showTimesheet } = useFeatureFlags();
  if (!balance) {
    return (
      <div className="hour-bank-banner" onClick={openSidePanel}>
        <div className="hour-bank-header">
          <BannerTitle showTimesheet={showTimesheet} />
        </div>
      </div>
    );
  }

  const isPositive = balance.totalMinutes >= 0;
  const className = `hour-bank-banner ${isPositive ? 'positive' : 'negative'}`;
  const zeroBankExit = calcZeroBankExitTime(estimatedExit, balance.totalMinutes);

  return (
    <div className={className} onClick={openSidePanel}>
      <div className="hour-bank-header">
        <BannerTitle showTimesheet={showTimesheet} />
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
      </div>
    </div>
  );
}
