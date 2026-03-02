import type { TimesheetEntry } from '../../domain/types';

interface TimesheetEntryRowProps {
  entry: TimesheetEntry;
}

export function TimesheetEntryRow({ entry }: TimesheetEntryRowProps) {
  const hrs = Math.floor(entry.hourQuantity);
  const mins = Math.round((entry.hourQuantity - hrs) * 60);
  const hoursLabel = mins === 0 ? `${hrs}h` : `${hrs}h${String(mins).padStart(2, '0')}`;

  return (
    <div className="ts-table-row">
      <span className="ts-col-hours mono">{hoursLabel}</span>
      <span className="ts-col-task" title={entry.task?.name || ''}>
        {entry.task?.name || '—'}
      </span>
      <span className="ts-col-cc" title={entry.costCenter ? `${entry.costCenter.code} - ${entry.costCenter.name}` : ''}>
        {entry.costCenter?.code || '—'}
      </span>
      {entry.observation && (
        <span className="ts-col-obs" title={entry.observation}>💬</span>
      )}
    </div>
  );
}
