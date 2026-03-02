interface TokenStatusProps {
  hasToken: boolean;
  loading: boolean;
}

export function TokenStatus({ hasToken, loading }: TokenStatusProps) {
  if (loading) {
    return <div className="token-status loading">Verificando token...</div>;
  }

  return (
    <div className={`token-status ${hasToken ? 'connected' : 'disconnected'}`}>
      <span className="token-dot" />
      {hasToken ? 'Conectado' : 'Sem token'}
    </div>
  );
}
