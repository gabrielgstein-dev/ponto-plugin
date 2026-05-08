import { useEffect } from 'react';
import { usePunchState } from './hooks/usePunchState';
import { useThemeMode } from './hooks/useThemeMode';
import { SettingsPanel } from './components/SettingsPanel';
import { SidePanelNav } from './components/SidePanelNav';
import { ThemeToggle } from './components/ThemeToggle';
import { NAV_MSG_TO_MAIN, navigateToMain } from './sidepanel-switch';

export function SettingsSidePanelApp() {
  // Sincroniza tema com o resto do app (aplica .dark no <html> e ouve mudanças
  // via chrome.storage). Sem isso, a página renderiza sempre no tema claro.
  useThemeMode();
  const { settings, loading, updateSettings, clearState } = usePunchState();

  // Quando o popup quer trocar pra Ponto/Timesheet, manda essa mensagem —
  // open() do popup seria no-op porque o sidepanel já está aberto aqui.
  useEffect(() => {
    const listener = (msg: unknown) => {
      if ((msg as { type?: string })?.type === NAV_MSG_TO_MAIN) {
        navigateToMain();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  if (loading) return <div className="settings-app"><span>Carregando...</span></div>;

  return (
    <div className="settings-app">
      <SidePanelNav active="settings" />
      <div className="settings-app-header">
        <h1 className="settings-app-title">Configurações</h1>
        <ThemeToggle />
      </div>
      <SettingsPanel settings={settings} onChange={updateSettings} onClear={clearState} />
    </div>
  );
}
