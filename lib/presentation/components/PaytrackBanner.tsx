import { getPaytrackStatus, PAYTRACK_URL } from '../../domain/paytrack-status';

function ReceiptIcon() {
  return (
    <span className="paytrack-banner-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2v20l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5V2l-2 1.5L18 2l-2 1.5L14 2l-2 1.5L10 2 8 3.5 6 2Z" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
        <path d="M12 17V6" />
      </svg>
    </span>
  );
}

function openPaytrack() {
  window.open(PAYTRACK_URL, '_blank', 'noopener,noreferrer');
}

interface PaytrackBannerProps {
  now?: Date;
}

export function PaytrackBanner({ now }: PaytrackBannerProps) {
  const status = getPaytrackStatus(now);
  const className = `paytrack-banner ${status.tone}`;

  return (
    <div className={className} onClick={openPaytrack} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openPaytrack(); }}>
      <div className="paytrack-banner-header">
        <div className="paytrack-banner-title">
          <ReceiptIcon />
          <span className="paytrack-banner-label">Paytrack</span>
        </div>
        <span className="paytrack-banner-value">{status.label}</span>
      </div>
    </div>
  );
}
