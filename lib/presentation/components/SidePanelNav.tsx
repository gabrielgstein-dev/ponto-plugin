import { ENABLE_META_TIMESHEET } from '../../domain/build-flags';
import { navigateToMain, navigateToSettings } from '../sidepanel-switch';

type Tab = 'ponto' | 'timesheet' | 'settings';

interface SidePanelNavProps {
  active: Tab;
  onLocalChange?: (tab: 'ponto' | 'timesheet') => void;
}

export function SidePanelNav({ active, onLocalChange }: SidePanelNavProps) {
  const handleClick = (tab: Tab) => {
    if (tab === active) return;

    if (tab === 'settings') {
      navigateToSettings();
      return;
    }

    if (active === 'settings') {
      // Saindo do painel de settings — pré-grava a aba alvo pro main ler ao
      // montar e navega trocando o conteúdo do slot.
      navigateToMain(tab);
      return;
    }

    // Troca local entre Ponto e Timesheet dentro do mesmo painel.
    onLocalChange?.(tab);
  };

  return (
    <div className="sp-tabs">
      <button
        className={`sp-tab ${active === 'ponto' ? 'active' : ''}`}
        onClick={() => handleClick('ponto')}
      >
        Ponto
      </button>
      {ENABLE_META_TIMESHEET && (
        <button
          className={`sp-tab ${active === 'timesheet' ? 'active' : ''}`}
          onClick={() => handleClick('timesheet')}
        >
          Timesheet
        </button>
      )}
      <button
        className={`sp-tab sp-tab-settings ${active === 'settings' ? 'active' : ''}`}
        onClick={() => handleClick('settings')}
        title="Configurações"
        aria-label="Configurações"
      >
        ⚙
      </button>
    </div>
  );
}
