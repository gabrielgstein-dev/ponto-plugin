import { useState, useCallback, useEffect } from 'react';
import type { TimesheetEntry, CostCenterAllocation } from '../../domain/types';

interface TimesheetRowMultipleProps {
  entry: TimesheetEntry;
  expanded: boolean;
  onToggle: () => void;
  onSave: (entry: TimesheetEntry, allocations: CostCenterAllocation[]) => Promise<{ ok: boolean; gpHours: number | null }>;
  onFetchGpHours: (dateStr: string) => Promise<number | null>;
}

export function TimesheetRowMultiple({ entry, expanded, onToggle, onSave, onFetchGpHours }: TimesheetRowMultipleProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gpHours, setGpHours] = useState<number | null>(null);
  const [gpLoading, setGpLoading] = useState(false);
  const [expandedCostCenter, setExpandedCostCenter] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, CostCenterAllocation>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!expanded) return;
    setGpLoading(true);
    const dateOnly = entry.date.includes('T') ? entry.date.split('T')[0] : entry.date;
    onFetchGpHours(dateOnly).then(h => { setGpHours(h); setGpLoading(false); });
  }, [expanded, entry.date, onFetchGpHours]);

  useEffect(() => {
    if (!entry.costCenters) return;
    const initial: Record<string, CostCenterAllocation> = {};
    entry.costCenters.forEach(cc => {
      initial[cc.code] = {
        costCenter: cc,
        task: entry.task,
        hourType: entry.hourType,
        hours: 0,
        observation: '',
      };
    });
    setAllocations(initial);
  }, [entry.costCenters, entry.task, entry.hourType]);

  const updateAllocation = (code: string, field: keyof CostCenterAllocation, value: unknown) => {
    setAllocations(prev => ({
      ...prev,
      [code]: { ...prev[code], [field]: value },
    }));
    setErrors(prev => ({ ...prev, [code]: '' }));
  };

  const totalAllocatedHours = Object.values(allocations).reduce((sum, a) => sum + (a.hours || 0), 0);

  const handleSave = useCallback(async () => {
    const newErrors: Record<string, string> = {};
    let hasError = false;

    Object.entries(allocations).forEach(([code, alloc]) => {
      if (!alloc.hours || alloc.hours <= 0) {
        newErrors[code] = 'Informe as horas';
        hasError = true;
      }
    });

    if (totalAllocatedHours === 0) {
      setErrors({ _global: 'Aloque horas em pelo menos um centro de custo' });
      return;
    }

    if (gpHours !== null && totalAllocatedHours > gpHours) {
      setErrors({ _global: `Total de horas (${formatHours(totalAllocatedHours)}) excede GP (${formatHours(gpHours)})` });
      return;
    }

    if (hasError) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    const allocList = Object.values(allocations).filter(a => a.hours > 0);
    const { ok } = await onSave(entry, allocList);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [allocations, entry, onSave, totalAllocatedHours, gpHours]);

  const missingObs = !entry.observation && entry.status === 'PENDING';
  const dirty = totalAllocatedHours > 0;

  return (
    <div className={`ts-row-wrapper ${expanded ? 'expanded' : ''} ${missingObs ? 'no-obs' : ''}`}>
      <div className="ts-table-row" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <span className="ts-col-date">
          {missingObs && <span className="ts-obs-dot" title="Sem observação" />}
          {formatDate(entry.date)}
        </span>
        <span className="ts-col-cc" title="Múltiplos centros de custo">Múltiplos</span>
        <span className="ts-col-hours">{formatHours(entry.hourQuantity)}</span>
        <span className={`ts-col-status ${entry.status.toLowerCase()}`}>{statusLabel(entry.status)}</span>
        <span className={`ts-col-chevron ${expanded ? 'open' : ''}`}>›</span>
      </div>
      {expanded && (
        <div className="ts-row-detail">
          <div className="ts-detail-field">
            <span className="ts-detail-label">Horas (GP)</span>
            {gpLoading && <span className="ts-detail-value ts-gp-loading">Consultando GP...</span>}
            {!gpLoading && gpHours !== null && (
              <span className="ts-detail-value">
                <span className="ts-gp-hours">{formatHours(gpHours)}</span>
              </span>
            )}
            {!gpLoading && gpHours === null && <span className="ts-detail-value ts-gp-unavail">Indisponível</span>}
          </div>

          <div className="ts-detail-field">
            <span className="ts-detail-label">
              Total Alocado: {formatHours(totalAllocatedHours)}
              {gpHours !== null && <span className="ts-hours-limit"> / {formatHours(gpHours)}</span>}
            </span>
          </div>

          {errors._global && <div className="ts-global-error">{errors._global}</div>}

          <div className="ts-detail-field">
            <span className="ts-detail-label">Centros de Custo — Alocação de Horas</span>
            <div className="ts-cc-list">
              {entry.costCenters!.map(cc => (
                <div key={cc.code} className="ts-cc-item">
                  <div 
                    className="ts-cc-header" 
                    onClick={() => setExpandedCostCenter(expandedCostCenter === cc.code ? null : cc.code)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="ts-cc-code">{cc.code}</span>
                    <span className="ts-cc-name">{cc.name}</span>
                    <span className="ts-cc-hours">
                      {allocations[cc.code]?.hours > 0 ? formatHours(allocations[cc.code].hours) : '—'}
                    </span>
                    <span className={`ts-col-chevron ${expandedCostCenter === cc.code ? 'open' : ''}`}>›</span>
                  </div>
                  {expandedCostCenter === cc.code && (
                    <div className="ts-cc-detail">
                      <div className="ts-alloc-field">
                        <label className="ts-alloc-label">Tarefa</label>
                        <span className="ts-alloc-value">{entry.task?.name || '—'}</span>
                      </div>
                      <div className="ts-alloc-field">
                        <label className="ts-alloc-label">Tipo de Hora</label>
                        <span className="ts-alloc-value">{entry.hourType?.description || '—'}</span>
                      </div>
                      <div className="ts-alloc-field">
                        <label className="ts-alloc-label">Horas *</label>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max={gpHours || undefined}
                          className={`ts-hours-input ${errors[cc.code] ? 'error' : ''}`}
                          placeholder="Ex: 4.5"
                          value={allocations[cc.code]?.hours || ''}
                          onChange={e => updateAllocation(cc.code, 'hours', parseFloat(e.target.value) || 0)}
                          onClick={e => e.stopPropagation()}
                        />
                        {errors[cc.code] && <span className="ts-hours-error">{errors[cc.code]}</span>}
                      </div>
                      <div className="ts-alloc-field">
                        <label className="ts-alloc-label">Observação</label>
                        <textarea
                          className="ts-obs-input"
                          rows={2}
                          maxLength={500}
                          placeholder="Observação para este centro de custo..."
                          value={allocations[cc.code]?.observation || ''}
                          onChange={e => updateAllocation(cc.code, 'observation', e.target.value)}
                          onClick={e => e.stopPropagation()}
                        />
                        <span className="ts-obs-counter">{(allocations[cc.code]?.observation || '').length}/500</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="ts-detail-field">
            <div className="ts-obs-footer">
              <span className="ts-save-hint">
                {saved ? <span className="ts-saved-badge">✓ Salvo</span> : 'Aloque horas em cada centro de custo'}
              </span>
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
