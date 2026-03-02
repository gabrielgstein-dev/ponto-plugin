interface TokenStatusProps {
  hasToken: boolean;
  loading: boolean;
  statusText?: string;
}

export function TokenStatus({ hasToken, loading, statusText }: TokenStatusProps) {
  if (loading) {
    return <div className="token-status loading">Verificando token...</div>;
  }

  return (
    <div className={`token-status ${hasToken ? 'connected' : 'disconnected'}`}>
      <span className="token-dot" />
      {hasToken ? 'Conectado' : 'Sem token'}
      {statusText && <span className="token-status-text">— {statusText}</span>}
    </div>
  );
}
