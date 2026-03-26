import { useState } from 'react';
import type { TimesheetEntry } from '../../domain/types';
import { useTimesheetData } from '../hooks/useTimesheetData';
import { TimesheetRowSingle } from './TimesheetRowSingle';
import { TimesheetRowMultiple } from './TimesheetRowMultiple';

export function TimesheetPanel() {
  const { summary, loading, available, connecting, periodLabel, isCurrentPeriod, goToPrev, goToNext, goToCurrent, updateEntry, updateEntryWithAllocations, fetchGpHours } = useTimesheetData();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (connecting || (!available && !loading)) {
    return (
      <div className="ts-container">
        <h2 className="ts-title">Timesheet</h2>
        <div className="ts-empty">
          {connecting
            ? <p>Conectando ao Timesheet...</p>
            : <p>Não foi possível conectar. <a href="https://plataforma.meta.com.br" target="_blank" rel="noreferrer" className="token-login-link">Abrir plataforma</a></p>
          }
        </div>
      </div>
    );
  }

  const entries = summary?.entries ?? [];

  return (
    <div className="ts-container">
      <h2 className="ts-title">Timesheet — Pendentes</h2>
      <button
        className="ts-test-notif-btn"
        onClick={() => {
          chrome.storage.local.remove('tsNotifShownDate');
          chrome.runtime.sendMessage({ type: 'TEST_TS_NOTIFICATION' });
        }}
      >Testar Notificação</button>

      {summary && (
        <div className="ts-summary">
          <div className="ts-summary-row">
            <span className="ts-summary-label">Pendentes</span>
            <span className="ts-summary-value pending">{formatHours(summary.pendingHours)}</span>
          </div>
          <div className="ts-summary-row">
            <span className="ts-summary-label">Aprovadas</span>
            <span className="ts-summary-value approved">{formatHours(summary.approvedHours)}</span>
          </div>
          <div className="ts-summary-row">
            <span className="ts-summary-label">Reprovadas</span>
            <span className="ts-summary-value reproved">{formatHours(summary.reprovedHours)}</span>
          </div>
          <div className="ts-summary-divider" />
          <div className="ts-summary-row">
            <span className="ts-summary-label">Horas Pendentes</span>
            <span className="ts-summary-value total">{formatHours(summary.pendingHours)}</span>
          </div>
        </div>
      )}

      <div className="sp-period-nav">
        <button className="sp-nav-btn" onClick={goToPrev} disabled={loading}>‹</button>
        <span className="sp-nav-label" onClick={!isCurrentPeriod ? goToCurrent : undefined} style={!isCurrentPeriod ? { cursor: 'pointer', textDecoration: 'underline' } : undefined}>
          {periodLabel}
          {!isCurrentPeriod && ' (voltar ao atual)'}
        </span>
        <button className="sp-nav-btn" onClick={goToNext} disabled={loading || isCurrentPeriod}>›</button>
      </div>

      {loading && entries.length === 0 && (
        <div className="ts-empty">Carregando...</div>
      )}

      {!loading && entries.length === 0 && (
        <div className="ts-empty">Nenhum lançamento pendente neste período</div>
      )}

      {entries.length > 0 && (
        <div className="ts-table">
          <div className="ts-table-header">
            <span>Dia</span>
            <span>Ce. Custo</span>
            <span>Qtd. Horas</span>
            <span>Status</span>
            <span></span>
          </div>
          {entries.map(entry => {
            const hasMultipleCostCenters = entry.costCenters && entry.costCenters.length > 1;
            
            if (hasMultipleCostCenters) {
              return (
                <TimesheetRowMultiple
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  onSave={updateEntryWithAllocations}
                  onFetchGpHours={fetchGpHours}
                />
              );
            }
            
            return (
              <TimesheetRowSingle
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onSave={updateEntry}
                onFetchGpHours={fetchGpHours}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
