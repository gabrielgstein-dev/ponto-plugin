import { useState } from 'react';
import { formatDiff, formatDateShort, todayDateStr } from '../domain/time-utils';
import { useSidePanelData } from './hooks/useSidePanelData';
import { DayRow } from './components/DayRow';
import { TimesheetPanel } from './components/TimesheetPanel';
import { ENABLE_META_TIMESHEET } from '../domain/build-flags';

type SidePanelTab = 'ponto' | 'timesheet';

export function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<SidePanelTab>('ponto');
  const { balance, records, source, loadingRecords, isCurrentPeriod, goToPrev, goToNext, goToCurrent, editPunch, removePunch, addPunch } = useSidePanelData();
  const isPositive = balance ? balance.totalMinutes >= 0 : true;
  const today = todayDateStr();

  return (
    <div className="sp-container">
      {ENABLE_META_TIMESHEET && (
        <div className="sp-tabs">
          <button className={`sp-tab ${activeTab === 'ponto' ? 'active' : ''}`} onClick={() => setActiveTab('ponto')}>Ponto</button>
          <button className={`sp-tab ${activeTab === 'timesheet' ? 'active' : ''}`} onClick={() => setActiveTab('timesheet')}>Timesheet</button>
        </div>
      )}

      {activeTab === 'ponto' && (
        <>
          <h1 className="sp-title">Histórico de Ponto</h1>

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
              <div className="sp-empty">Nenhum registro no período atual</div>
            )}
            {records.map(r => (
              <DayRow key={r.date} record={r} readOnly={source === 'gp' || r.date === today} onEdit={editPunch} onRemove={removePunch} onAdd={addPunch} />
            ))}
          </div>
        </>
      )}

      {activeTab === 'timesheet' && <TimesheetPanel />}
    </div>
  );
}
