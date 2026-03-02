import type { Settings } from '../../domain/types';

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
          <SettingRow label="Dia Fechamento" value={settings.closingDay} onChange={v => onChange({ closingDay: Math.min(28, Math.max(1, Math.round(v))) })} />
          <button className="clear-btn" onClick={onClear}>Limpar registros de hoje</button>
        </div>
      )}
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
