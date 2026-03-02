import { useState } from 'react';
import type { DayRecord } from '../../domain/types';
import { formatDateLabel, formatWorked, formatDiff } from '../../domain/time-utils';

interface DayRowProps {
  record: DayRecord;
  readOnly?: boolean;
  onEdit: (date: string, oldTime: string, newTime: string) => void;
  onRemove: (date: string, time: string) => void;
  onAdd: (date: string, time: string) => void;
}

export function DayRow({ record, readOnly, onEdit, onRemove, onAdd }: DayRowProps) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState('');

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

  return (
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
        {!readOnly && record.punches.length < 4 && (
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
      </span>
      <span className="sp-col-worked">{formatWorked(record.workedMinutes)}</span>
      <span className={`sp-col-balance ${record.balanceMinutes >= 0 ? 'positive' : 'negative'}`}>
        {formatDiff(record.balanceMinutes)}
      </span>
    </div>
  );
}
