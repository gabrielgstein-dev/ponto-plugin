import { useState, useCallback, useEffect } from 'react';
import type { TimesheetEntry } from '../../domain/types';

interface TimesheetRowSingleProps {
  entry: TimesheetEntry;
  expanded: boolean;
  onToggle: () => void;
  onSave: (entry: TimesheetEntry, observation: string, manualHours?: number) => Promise<{ ok: boolean; gpHours: number | null }>;
  onFetchGpHours: (dateStr: string) => Promise<number | null>;
}

export function TimesheetRowSingle({ entry, expanded, onToggle, onSave, onFetchGpHours }: TimesheetRowSingleProps) {
  const [obsValue, setObsValue] = useState(entry.observation || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gpHours, setGpHours] = useState<number | null>(null);
  const [gpLoading, setGpLoading] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setGpLoading(true);
    const dateOnly = entry.date.includes('T') ? entry.date.split('T')[0] : entry.date;
    onFetchGpHours(dateOnly).then(h => { setGpHours(h); setGpLoading(false); });
  }, [expanded, entry.date, onFetchGpHours]);

  const dirty = obsValue.trim() !== (entry.observation || '');

  const handleSave = useCallback(async () => {
    setSaving(true);
    const { ok } = await onSave(entry, obsValue.trim());
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [obsValue, entry, onSave]);

  const missingObs = !entry.observation && entry.status === 'PENDING';

  return (
    <div className={`ts-row-wrapper ${expanded ? 'expanded' : ''} ${missingObs ? 'no-obs' : ''}`}>
      <div className="ts-table-row" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <span className="ts-col-date">
          {missingObs && <span className="ts-obs-dot" title="Sem observação" />}
          {formatDate(entry.date)}
        </span>
        <span className="ts-col-cc" title={entry.costCenter ? `${entry.costCenter.code} - ${entry.costCenter.name}` : ''}>{entry.costCenter?.code || '—'}</span>
        <span className="ts-col-hours">{formatHours(entry.hourQuantity)}</span>
        <span className={`ts-col-status ${entry.status.toLowerCase()}`}>{statusLabel(entry.status)}</span>
        <span className={`ts-col-chevron ${expanded ? 'open' : ''}`}>›</span>
      </div>
      {expanded && (
        <div className="ts-row-detail">
          <div className="ts-detail-field">
            <span className="ts-detail-label">Centro de Custo</span>
            <span className="ts-detail-value">{entry.costCenter ? `${entry.costCenter.code} - ${entry.costCenter.name}` : '—'}</span>
          </div>
          <div className="ts-detail-field">
            <span className="ts-detail-label">Tarefa</span>
            <span className="ts-detail-value">{entry.task ? `${entry.task.name}` : '—'}</span>
          </div>
          <div className="ts-detail-field">
            <span className="ts-detail-label">Tipo Hora</span>
            <span className="ts-detail-value">{entry.hourType?.description || '—'}</span>
          </div>
          <div className="ts-detail-field">
            <span className="ts-detail-label">Horas (GP)</span>
            {gpLoading && <span className="ts-detail-value ts-gp-loading">Consultando GP...</span>}
            {!gpLoading && gpHours !== null && (
              <span className="ts-detail-value">
                <span className="ts-gp-hours">{formatHours(gpHours)}</span>
                {Math.abs(gpHours - entry.hourQuantity) > 0.01 && (
                  <span className="ts-gp-diff"> (TS: {formatHours(entry.hourQuantity)} → GP: {formatHours(gpHours)})</span>
                )}
              </span>
            )}
            {!gpLoading && gpHours === null && <span className="ts-detail-value ts-gp-unavail">Indisponível</span>}
          </div>
          <div className="ts-detail-field">
            <span className="ts-detail-label">Observação {saved && <span className="ts-saved-badge">✓ Salvo</span>}</span>
            <textarea
              className="ts-obs-input"
              rows={3}
              maxLength={1000}
              placeholder="Adicionar observação..."
              value={obsValue}
              onChange={e => setObsValue(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
            <div className="ts-obs-footer">
              <span className="ts-obs-counter">{obsValue.length}/1000</span>
              <button
                className="ts-obs-save-btn"
                disabled={!dirty || saving}
                onClick={e => { e.stopPropagation(); handleSave(); }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
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
