import { useGpHostMigration } from '../hooks/useGpHostMigration';

/**
 * Aviso único da migração de host do GestãoPonto (0.15.0). Só aparece quando o
 * Chrome ainda não concedeu `gestaoponto.insi.com`; ao clicar em Ativar, pede
 * a permissão, limpa caches antigos e força uma sync.
 */
export function GpHostMigrationBanner() {
  const { pending, activating, activate } = useGpHostMigration();
  if (!pending) return null;

  return (
    <div className="gp-migration-banner" data-testid="gp-migration-banner" role="status">
      <p className="gp-migration-msg">
        O GestãoPonto e a Plataforma mudaram para <strong>insi.com</strong>. O Chrome precisa da sua
        permissão para o plugin voltar a sincronizar ponto e timesheet — sua sessão continua a mesma.
      </p>
      <button
        className="gp-migration-btn"
        onClick={activate}
        disabled={activating}
        data-testid="gp-migration-activate"
      >
        {activating ? 'Ativando...' : 'Ativar'}
      </button>
    </div>
  );
}
