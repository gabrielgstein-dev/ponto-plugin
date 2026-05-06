import { useState, useCallback } from 'react';

interface ResyncButtonProps {
  onSyncDone?: () => void;
}

/**
 * Override manual quando a detecção automática estiver presa ou cache stale.
 * Manda FORCE_REDETECT pro background, que reseta caches e dispara detecção
 * agressiva. Substitui o anti-padrão de "abrir aba do Senior pra destravar".
 */
export function ResyncButton({ onSyncDone }: ResyncButtonProps) {
  const [syncing, setSyncing] = useState(false);

  const handleClick = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await chrome.runtime.sendMessage({ type: 'FORCE_REDETECT' });
      onSyncDone?.();
    } catch {
      // Silencioso: errorLogger no background já registra falhas reais
    } finally {
      // Pequeno hold pro feedback visual ser perceptível
      setTimeout(() => setSyncing(false), 600);
    }
  }, [syncing, onSyncDone]);

  return (
    <button
      type="button"
      className={`resync-btn${syncing ? ' syncing' : ''}`}
      onClick={handleClick}
      disabled={syncing}
      title="Recarregar batimentos"
      aria-label="Recarregar batimentos"
    >
      <span className="resync-icon">↻</span>
      {syncing ? 'Sincronizando...' : 'Sincronizar'}
    </button>
  );
}
