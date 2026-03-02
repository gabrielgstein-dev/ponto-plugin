import type { TimesheetEntry } from '../../domain/types';
import { useTimesheetData } from '../hooks/useTimesheetData';

export function TimesheetPanel() {
  const { summary, loading, available, periodLabel, isCurrentPeriod, goToPrev, goToNext, goToCurrent } = useTimesheetData();

  if (!available && !loading) {
    return (
      <div className="ts-container">
        <h2 className="ts-title">Timesheet</h2>
        <div className="ts-empty">
          Sem token disponível. Acesse <strong>plataforma.meta.com.br</strong> para autenticar.
        </div>
      </div>
    );
  }

  const entries = summary?.entries ?? [];

  return (
    <div className="ts-container">
      <h2 className="ts-title">Timesheet — Pendentes</h2>

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
          </div>
          {entries.map(entry => (
            <TimesheetRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimesheetRow({ entry }: { entry: TimesheetEntry }) {
  return (
    <div className="ts-table-row">
      <span className="ts-col-date">{formatDate(entry.date)}</span>
      <span className="ts-col-cc" title={entry.costCenter ? `${entry.costCenter.code} - ${entry.costCenter.name}` : ''}>{entry.costCenter?.code || '—'}</span>
      <span className="ts-col-hours">{formatHours(entry.hourQuantity)}</span>
      <span className={`ts-col-status ${entry.status.toLowerCase()}`}>{statusLabel(entry.status)}</span>
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.includes('T') ? dateStr.split('T')[0].split('-') : dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[2]}/${parts[1]}`;
}

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { PENDING: 'Pendente', APPROVED: 'Aprovado', REPROVED: 'Reprovado' };
  return map[s] || s;
}
