interface StatusBannerProps {
  text: string;
  type: 'info' | 'success' | 'warning';
}

export function StatusBanner({ text, type }: StatusBannerProps) {
  return (
    <div className={`status-banner ${type}`}>
      {text}
    </div>
  );
}
