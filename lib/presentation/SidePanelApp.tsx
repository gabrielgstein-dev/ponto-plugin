import { useState, useEffect } from 'react';
import { formatDiff, formatDateShort, todayDateStr } from '../domain/time-utils';
import { useSidePanelData } from './hooks/useSidePanelData';
import { useFeatureFlags } from './hooks/useFeatureFlags';
import { DayRow } from './components/DayRow';
import { TimesheetPanel } from './components/TimesheetPanel';
import { ThemeToggle } from './components/ThemeToggle';
import { ResyncButton } from './components/ResyncButton';
import { SidePanelNav } from './components/SidePanelNav';
import { SpikeDebugPanel } from './components/SpikeDebugPanel';
import { NAV_MSG_TO_SETTINGS, navigateToSettings } from './sidepanel-switch';

type SidePanelTab = 'ponto' | 'timesheet';

export function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<SidePanelTab>('ponto');
  const { showTimesheet } = useFeatureFlags();
  const { balance, records, source, loadingRecords, isCurrentPeriod, goToPrev, goToNext, goToCurrent, editPunch, removePunch, addPunch, addGpPunch } = useSidePanelData();

  useEffect(() => {
    chrome.storage.local.get('sidePanelTab').then((data) => {
      if (data.sidePanelTab === 'timesheet' || data.sidePanelTab === 'ponto') {
        setActiveTab(data.sidePanelTab);
        chrome.storage.local.remove('sidePanelTab');
      }
    });
  }, []);

  useEffect(() => {
    if (!showTimesheet && activeTab === 'timesheet') setActiveTab('ponto');
  }, [showTimesheet, activeTab]);

  // Quando o popup pede pra trocar pro settings com o sidepanel já aberto
  // aqui, open() do popup é no-op — recebemos via mensagem e navegamos.
  useEffect(() => {
    const listener = (msg: unknown) => {
      if ((msg as { type?: string })?.type === NAV_MSG_TO_SETTINGS) {
        navigateToSettings();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  const isPositive = balance ? balance.totalMinutes >= 0 : true;
  const today = todayDateStr();

  return (
    <div className="sp-container">
      <SidePanelNav active={activeTab} onLocalChange={setActiveTab} />

      {activeTab === 'ponto' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 className="sp-title">Histórico de Ponto</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ResyncButton />
              <ThemeToggle />
            </div>
          </div>

          {balance && (
            <div className={`sp-bank ${isPositive ? 'positive' : 'negative'}`}>
              <div className="sp-bank-row">
                <span className="sp-bank-label">Saldo do Período</span>
                <span className="sp-bank-value">{formatDiff(balance.totalMinutes)}</span>
              </div>
            </div>
          )}

          {balance && source === 'gp' && (
            <div className="sp-period-nav">
              <button className="sp-nav-btn" onClick={goToPrev} disabled={loadingRecords}>‹</button>
              <span className="sp-nav-label" onClick={!isCurrentPeriod ? goToCurrent : undefined} style={!isCurrentPeriod ? { cursor: 'pointer', textDecoration: 'underline' } : undefined}>
                {formatDateShort(balance.periodStart)} — {formatDateShort(balance.periodEnd)}
                {!isCurrentPeriod && ' (voltar ao atual)'}
              </span>
              <button className="sp-nav-btn" onClick={goToNext} disabled={loadingRecords || isCurrentPeriod}>›</button>
            </div>
          )}

          <div className="sp-table">
            <div className="sp-table-header">
              <span className="sp-col-date">Data</span>
              <span className="sp-col-punches">Batimentos</span>
              <span className="sp-col-worked">Trabalhado</span>
              <span className="sp-col-balance">Saldo</span>
            </div>
            {records.length === 0 && (
              <div className="sp-empty">
                {loadingRecords ? 'Carregando...' : 'Nenhum registro no período atual'}
              </div>
            )}
            {records.map(r => (
              <DayRow
                key={r.date}
                record={r}
                readOnly={source === 'gp' || r.date === today}
                onEdit={editPunch}
                onRemove={removePunch}
                onAdd={addPunch}
                onAddGpAjuste={source === 'gp' ? addGpPunch : undefined}
              />
            ))}
          </div>

          <SpikeDebugPanel />
        </>
      )}

      {activeTab === 'timesheet' && showTimesheet && <TimesheetPanel />}
    </div>
  );
}
