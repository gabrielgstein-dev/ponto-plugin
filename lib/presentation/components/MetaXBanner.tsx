import { getMetaXStatus, META_X_URL } from '../../domain/meta-x-status';
import { useMetaXState } from '../hooks/useMetaXState';

function SparkleIcon() {
  return (
    <span className="meta-x-banner-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </span>
  );
}

function openSurvey() {
  window.open(META_X_URL, '_blank', 'noopener,noreferrer');
}

interface MetaXBannerProps {
  now?: Date;
}

export function MetaXBanner({ now }: MetaXBannerProps) {
  const { metaXState } = useMetaXState();
  const status = getMetaXStatus(now ?? new Date(), metaXState);

  if (!status.shouldShow) return null;

  const showActions = status.tone === 'urgent' || status.tone === 'attention';

  return (
    <div className={`meta-x-banner ${status.tone}`}>
      <div className="meta-x-banner-shimmer" aria-hidden="true" />
      <div className="meta-x-banner-aurora" aria-hidden="true" />
      <div className="meta-x-banner-content">
        <div className="meta-x-banner-header">
          <div className="meta-x-banner-title">
            <SparkleIcon />
            <span className="meta-x-banner-label">Meta X</span>
          </div>
          <span className="meta-x-banner-value">{status.label}</span>
        </div>
        {showActions && (
          <div className="meta-x-banner-actions">
            <button
              type="button"
              className="meta-x-banner-btn meta-x-banner-btn-primary"
              onClick={openSurvey}
            >
              Responder agora
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
