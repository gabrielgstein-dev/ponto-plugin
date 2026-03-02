interface PunchButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}

export function PunchButton({ onClick, loading, disabled }: PunchButtonProps) {
  return (
    <button
      className="punch-btn"
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <span className="spinner" />
      ) : (
        'Bater Ponto'
      )}
    </button>
  );
}
