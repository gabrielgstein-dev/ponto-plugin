import { getInsiXStatus, INSI_X_URL } from '../../domain/insi-x-status';
import { useInsiXState } from '../hooks/useInsiXState';

function SparkleIcon() {
  return (
    <span className="insi-x-banner-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </span>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function openSurvey() {
  window.open(INSI_X_URL, '_blank', 'noopener,noreferrer');
}

export function InsiXDoneHint({ now }: { now?: Date }) {
  const { insiXState } = useInsiXState();
  const status = getInsiXStatus(now ?? new Date(), insiXState);
  if (status.tone !== 'done') return null;
  return (
    <span className="insi-x-done-hint">
      <CheckIcon /> Insi X respondido
    </span>
  );
}

interface InsiXBannerProps {
  now?: Date;
}

export function InsiXBanner({ now }: InsiXBannerProps) {
  const { insiXState } = useInsiXState();
  const status = getInsiXStatus(now ?? new Date(), insiXState);

  if (!status.shouldShow) return null;

  if (status.tone === 'done') return null;

  return (
    <div className={`insi-x-banner ${status.tone}`}>
      <div className="insi-x-banner-shimmer" aria-hidden="true" />
      <div className="insi-x-banner-aurora" aria-hidden="true" />
      <div className="insi-x-banner-content">
        <div className="insi-x-banner-header">
          <div className="insi-x-banner-title">
            <SparkleIcon />
            <span className="insi-x-banner-label">Insi X</span>
          </div>
          <span className="insi-x-banner-value">{status.label}</span>
        </div>
        <div className="insi-x-banner-actions">
          <button
            type="button"
            className="insi-x-banner-btn insi-x-banner-btn-primary"
            onClick={openSurvey}
          >
            Responder agora
          </button>
        </div>
      </div>
    </div>
  );
}
