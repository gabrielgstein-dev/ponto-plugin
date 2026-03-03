interface TokenStatusProps {
  hasToken: boolean;
  loading: boolean;
  statusText?: string;
  hasAuth?: boolean | null;
}

export function TokenStatus({ hasToken, loading, statusText, hasAuth }: TokenStatusProps) {
  if (loading) {
    return <div className="token-status loading">Verificando token...</div>;
  }

  if (hasAuth === false) {
    return (
      <div className="token-status disconnected">
        <span className="token-dot" />
        Desconectado
        <span className="token-status-text">
          — <a href="https://platform.senior.com.br" target="_blank" rel="noreferrer" className="token-login-link">Conecte-se ao Senior</a> para sincronizar
        </span>
      </div>
    );
  }

  return (
    <div className={`token-status ${hasToken ? 'connected' : 'disconnected'}`}>
      <span className="token-dot" />
      {hasToken ? 'Conectado' : 'Sem token'}
      {statusText && <span className="token-status-text">— {statusText}</span>}
    </div>
  );
}
