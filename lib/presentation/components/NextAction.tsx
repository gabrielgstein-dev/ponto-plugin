interface NextActionProps {
  label: string;
  countdown: string;
  visible: boolean;
}

export function NextAction({ label, countdown, visible }: NextActionProps) {
  if (!visible) return null;

  return (
    <div className="next-action">
      <span className="next-label">{label}</span>
      <span className="next-countdown">{countdown}</span>
    </div>
  );
}
