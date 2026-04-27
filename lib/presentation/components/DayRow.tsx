import { useState } from 'react';
import type { DayRecord } from '../../domain/types';
import { formatDateLabel, formatWorked, formatDiff } from '../../domain/time-utils';
import { JUSTIFICATIVAS, type JustificativaCodigo } from '../../infrastructure/meta/gestaoponto/gp-ajuste';

interface DayRowProps {
  record: DayRecord;
  readOnly?: boolean;
  onEdit: (date: string, oldTime: string, newTime: string) => void;
  onRemove: (date: string, time: string) => void;
  onAdd: (date: string, time: string) => void;
  onAddGpAjuste?: (date: string, time: string, justificativaCodigo: JustificativaCodigo) => Promise<{ ok: boolean; message: string }>;
}

export function DayRow({ record, readOnly, onEdit, onRemove, onAdd, onAddGpAjuste }: DayRowProps) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [ajusteOpen, setAjusteOpen] = useState(false);

  const saveEdit = () => {
    if (editIdx != null && editValue) {
      onEdit(record.date, record.punches[editIdx], editValue);
    }
    setEditIdx(null);
  };

  const saveAdd = () => {
    if (addValue) onAdd(record.date, addValue);
    setAdding(false);
    setAddValue('');
  };

  const canAddMore = record.punches.length < 4;

  return (
    <>
      <div className="sp-table-row">
        <span className="sp-col-date">{formatDateLabel(record.date)}</span>
        <span className="sp-col-punches">
          {record.punches.map((p, i) => (
            <span key={i} className="sp-punch-chip">
              {!readOnly && editIdx === i ? (
                <input
                  type="time" className="sp-punch-input" value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={e => e.key === 'Enter' && saveEdit()}
                  autoFocus
                />
              ) : (
                <>
                  <span className={readOnly ? 'sp-punch-time readonly' : 'sp-punch-time'} onClick={() => { if (!readOnly) { setEditIdx(i); setEditValue(p); } }}>{p}</span>
                  {!readOnly && <button className="sp-punch-remove" onClick={() => onRemove(record.date, p)}>×</button>}
                </>
              )}
            </span>
          ))}
          {!readOnly && canAddMore && (
            adding ? (
              <span className="sp-punch-chip">
                <input
                  type="time" className="sp-punch-input" value={addValue}
                  onChange={e => setAddValue(e.target.value)}
                  onBlur={() => { if (addValue) saveAdd(); else setAdding(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdding(false); }}
                  autoFocus
                />
              </span>
            ) : (
              <button className="sp-punch-add" onClick={() => setAdding(true)}>+</button>
            )
          )}
          {onAddGpAjuste && canAddMore && (
            <button
              className={`sp-punch-add ${ajusteOpen ? 'active' : ''}`}
              onClick={() => setAjusteOpen(o => !o)}
              title="Adicionar marcação com justificativa"
            >
              {ajusteOpen ? '×' : '+'}
            </button>
          )}
        </span>
        <span className="sp-col-worked">{formatWorked(record.workedMinutes)}</span>
        <span className={`sp-col-balance ${record.balanceMinutes >= 0 ? 'positive' : 'negative'}`}>
          {formatDiff(record.balanceMinutes)}
        </span>
      </div>
      {ajusteOpen && onAddGpAjuste && (
        <AjustePanel
          date={record.date}
          onSubmit={onAddGpAjuste}
          onClose={() => setAjusteOpen(false)}
        />
      )}
    </>
  );
}

interface AjustePanelProps {
  date: string;
  onSubmit: (date: string, time: string, justificativaCodigo: JustificativaCodigo) => Promise<{ ok: boolean; message: string }>;
  onClose: () => void;
}

function AjustePanel({ date, onSubmit, onClose }: AjustePanelProps) {
  const [time, setTime] = useState('');
  const [justificativa, setJustificativa] = useState<JustificativaCodigo | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValid = time !== '' && justificativa !== '';

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    setError('');
    const result = await onSubmit(date, time, justificativa as JustificativaCodigo);
    setLoading(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="sp-ajuste-panel">
      <span className="sp-ajuste-label">Ajuste de marcação</span>
      <div className="sp-ajuste-fields">
        <input
          type="time"
          className="sp-punch-input sp-ajuste-time"
          value={time}
          onChange={e => setTime(e.target.value)}
          autoFocus
        />
        <select
          className="sp-ajuste-select"
          value={justificativa}
          onChange={e => setJustificativa(Number(e.target.value) as JustificativaCodigo)}
        >
          <option value="">Selecione o motivo...</option>
          {JUSTIFICATIVAS.map(j => (
            <option key={j.codigo} value={j.codigo}>{j.codigo} — {j.descricao}</option>
          ))}
        </select>
        <div className="sp-ajuste-actions">
          <button
            className="sp-ajuste-btn confirm"
            onClick={handleSubmit}
            disabled={!isValid || loading}
            title="Confirmar ajuste"
          >
            {loading ? '...' : 'Salvar'}
          </button>
          <button className="sp-ajuste-btn cancel" onClick={onClose} title="Cancelar">
            Cancelar
          </button>
        </div>
      </div>
      {error && <span className="sp-ajuste-error">{error}</span>}
    </div>
  );
}
