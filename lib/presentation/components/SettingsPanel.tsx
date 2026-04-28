import { useState } from 'react';
import type { Settings } from '../../domain/types';
import { ENABLE_SENIOR_INTEGRATION } from '../../domain/build-flags';
import { exportLogs } from '../export-logs';
import { clearLogs } from '../../domain/log-store';

interface SettingsPanelProps {
  open: boolean;
  settings: Settings;
  onToggle: () => void;
  onChange: (partial: Partial<Settings>) => void;
  onClear: () => void;
}

export function SettingsPanel({ open, settings, onToggle, onChange, onClear }: SettingsPanelProps) {
  return (
    <div className="settings-section">
      <button className="settings-toggle" onClick={onToggle}>
        {open ? '▲ Fechar Configurações' : '⚙ Configurações'}
      </button>
      {open && (
        <div className="settings-body">
          <SettingRow label="Jornada (horas)" value={settings.jornada / 60} onChange={v => onChange({ jornada: Math.round(v * 60) })} step={0.5} />
          <TimeSettingRow label="Horário Almoço" value={settings.almocoHorario} onChange={v => onChange({ almocoHorario: v })} />
          <SettingRow label="Duração Almoço (min)" value={settings.almocoDur} onChange={v => onChange({ almocoDur: v })} />
          <SettingRow label="Antecipação Notif. (min)" value={settings.notifAntecip} onChange={v => onChange({ notifAntecip: v })} />
          <SettingRow label="Lembrete Atraso (min)" value={settings.lembreteAtraso} onChange={v => onChange({ lembreteAtraso: Math.max(0, Math.round(v)) })} />
          {!ENABLE_SENIOR_INTEGRATION && <SettingRow label="Dia Fechamento" value={settings.closingDay} onChange={v => onChange({ closingDay: Math.min(28, Math.max(1, Math.round(v))) })} />}
          <button className="clear-btn" onClick={onClear}>Limpar registros de hoje</button>
          <LogsActions />
        </div>
      )}
    </div>
  );
}

function LogsActions() {
  const [busy, setBusy] = useState<'export' | 'clear' | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  const handleExport = async () => {
    setBusy('export');
    setFeedback('');
    try {
      await exportLogs();
      setFeedback('Logs exportados.');
    } catch (_) {
      setFeedback('Falha ao exportar logs.');
    }
    setBusy(null);
  };

  const handleClear = async () => {
    setBusy('clear');
    setFeedback('');
    try {
      await clearLogs();
      setFeedback('Logs limpos.');
    } catch (_) {
      setFeedback('Falha ao limpar logs.');
    }
    setBusy(null);
  };

  return (
    <div className="logs-actions">
      <button
        className="logs-export-btn"
        onClick={handleExport}
        disabled={busy !== null}
      >
        {busy === 'export' ? 'Exportando...' : 'Exportar logs'}
      </button>
      <button
        className="logs-clear-btn"
        onClick={handleClear}
        disabled={busy !== null}
      >
        {busy === 'clear' ? 'Limpando...' : 'Limpar logs'}
      </button>
      {feedback && <span className="logs-feedback">{feedback}</span>}
    </div>
  );
}

interface SettingRowProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  step?: number;
}

function SettingRow({ label, value, onChange, step }: SettingRowProps) {
  return (
    <div className="setting-row">
      <label>{label}</label>
      <input type="number" value={value} step={step} onChange={e => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

interface TimeSettingRowProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

function TimeSettingRow({ label, value, onChange }: TimeSettingRowProps) {
  return (
    <div className="setting-row">
      <label>{label}</label>
      <input type="time" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
