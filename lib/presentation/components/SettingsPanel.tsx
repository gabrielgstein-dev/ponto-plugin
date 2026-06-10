import { useRef, useState } from 'react';
import type { Settings } from '../../domain/types';
import { DEBUG, ENABLE_SENIOR_INTEGRATION, ENABLE_META_TIMESHEET } from '../../domain/build-flags';
import { exportLogs } from '../export-logs';
import { clearLogs } from '../../domain/log-store';
import { exportMetaNetLog, clearMetaNetLog } from '../export-meta-net-log';

interface StorageEntry {
  key: string;
  length: number;
  preview?: string;
}

interface IdbItem {
  key: string;
  valueLength: number;
  preview?: string;
}

interface IdbStore {
  name: string;
  count: number;
  items: IdbItem[];
}

interface IdbDatabase {
  name: string;
  version?: number;
  stores: IdbStore[];
}

interface SeniorStorageDump {
  ok: boolean;
  url?: string;
  origin?: string;
  localStorage?: StorageEntry[];
  sessionStorage?: StorageEntry[];
  indexedDB?: IdbDatabase[];
  errorMessage?: string;
}

interface SettingsPanelProps {
  settings: Settings;
  onChange: (partial: Partial<Settings>) => void;
  onClear: () => void;
}

export function SettingsPanel({ settings, onChange, onClear }: SettingsPanelProps) {
  return (
    <div className="settings-section">
      <div className="settings-body">
        <SettingRow label="Jornada (horas)" value={settings.jornada / 60} onChange={v => onChange({ jornada: Math.round(v * 60) })} step={0.5} />
        <TimeSettingRow label="Horário Entrada" value={settings.entradaHorario} onChange={v => onChange({ entradaHorario: v })} />
        <TimeSettingRow label="Horário Almoço" value={settings.almocoHorario} onChange={v => onChange({ almocoHorario: v })} />
        <SettingRow label="Duração Almoço (min)" value={settings.almocoDur} onChange={v => onChange({ almocoDur: v })} />
        <SettingRow label="Antecipação Notif. (min)" value={settings.notifAntecip} onChange={v => onChange({ notifAntecip: v })} />
        <SettingRow label="Lembrete Atraso (min)" value={settings.lembreteAtraso} onChange={v => onChange({ lembreteAtraso: Math.max(0, Math.round(v)) })} />
        <div className="setting-row">
          <label htmlFor="weekdays-only">Só dias úteis (seg-sex)</label>
          <input
            id="weekdays-only"
            type="checkbox"
            className="setting-checkbox"
            checked={settings.weekdaysOnly}
            onChange={e => onChange({ weekdaysOnly: e.target.checked })}
          />
        </div>
        <div className="setting-row">
          <label htmlFor="paytrack-reminder">Lembrete Paytrack</label>
          <input
            id="paytrack-reminder"
            type="checkbox"
            className="setting-checkbox"
            checked={settings.paytrackReminder}
            onChange={e => onChange({ paytrackReminder: e.target.checked })}
          />
        </div>
        <div className="setting-row">
          <label htmlFor="meta-x-reminder">Lembrete Meta X</label>
          <input
            id="meta-x-reminder"
            type="checkbox"
            className="setting-checkbox"
            checked={settings.metaXReminder}
            onChange={e => onChange({ metaXReminder: e.target.checked })}
          />
        </div>
        <SoundSettings settings={settings} onChange={onChange} />
        {!ENABLE_SENIOR_INTEGRATION && <SettingRow label="Dia Fechamento" value={settings.closingDay} onChange={v => onChange({ closingDay: Math.min(28, Math.max(1, Math.round(v))) })} />}
        <button className="clear-btn" onClick={onClear}>Limpar registros de hoje</button>
        <LogsActions />
        {DEBUG && ENABLE_META_TIMESHEET && <MetaNetLogActions />}
        {DEBUG && <DebugReminderTest />}
        {DEBUG && <DebugMetaXTest />}
        {DEBUG && ENABLE_META_TIMESHEET && <DebugMetaTsDirectFetch />}
        {DEBUG && ENABLE_SENIOR_INTEGRATION && <DebugSeniorStorageDump />}
        <VersionFooter />
      </div>
    </div>
  );
}

function VersionFooter() {
  const runtime = chrome?.runtime as unknown as { getManifest?: () => { version?: string } } | undefined;
  const version = runtime?.getManifest?.()?.version;
  if (!version) return null;
  return <div className="settings-version">v{version}</div>;
}

function DebugSeniorStorageDump() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SeniorStorageDump | null>(null);
  const [err, setErr] = useState<string>('');

  const handleClick = async () => {
    setBusy(true);
    setResult(null);
    setErr('');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'TEST_SENIOR_STORAGE_DUMP' }) as
        | { ok: true; result: SeniorStorageDump }
        | { ok: false; error: string };
      if (response?.ok) setResult(response.result);
      else setErr(response?.error ?? 'sem resposta');
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const renderEntry = (e: StorageEntry) =>
    `  ${e.key} (${e.length} chars)${e.preview ? '\n    preview: ' + e.preview : ''}`;
  const renderIdbItem = (i: IdbItem) =>
    `    [${i.key}] (${i.valueLength} chars)${i.preview ? '\n      preview: ' + i.preview : ''}`;
  const renderIdbStore = (s: IdbStore) =>
    `  store: ${s.name} (${s.count} items)\n${s.items.map(renderIdbItem).join('\n') || '    (vazio)'}`;
  const renderIdbDb = (d: IdbDatabase) =>
    `db: ${d.name} (v${d.version ?? '?'})\n${d.stores.map(renderIdbStore).join('\n')}`;

  return (
    <div className="logs-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <button className="logs-export-btn" onClick={handleClick} disabled={busy}>
        {busy ? 'Lendo...' : 'POC: dump storage Senior'}
      </button>
      {err && <span className="logs-feedback">erro: {err}</span>}
      {result && (
        <pre style={{
          fontSize: 11,
          background: 'var(--bg-secondary, #f5f5f5)',
          padding: 8,
          borderRadius: 4,
          overflow: 'auto',
          maxHeight: 360,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
{result.ok
  ? `url: ${result.url}
origin: ${result.origin}

localStorage (${result.localStorage?.length ?? 0} keys):
${result.localStorage?.map(renderEntry).join('\n') || '  (vazio)'}

sessionStorage (${result.sessionStorage?.length ?? 0} keys):
${result.sessionStorage?.map(renderEntry).join('\n') || '  (vazio)'}

indexedDB (${result.indexedDB?.length ?? 0} dbs):
${result.indexedDB?.map(renderIdbDb).join('\n\n') || '  (vazio)'}`
  : `erro: ${result.errorMessage}`}
        </pre>
      )}
    </div>
  );
}

interface TokenInfo {
  isJwt: boolean;
  expiresInSec: number | null;
  ageMs: number | null;
}

interface DirectFetchResult {
  ok: boolean;
  status: number;
  bodyPreview: string;
  bodyLength: number;
  contentType: string;
  responseHeaders: Record<string, string>;
  errorMessage?: string;
  tokenInfo: TokenInfo;
}

function DebugMetaTsDirectFetch() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DirectFetchResult | null>(null);
  const [err, setErr] = useState<string>('');

  const handleClick = async () => {
    setBusy(true);
    setResult(null);
    setErr('');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'TEST_META_TS_DIRECT_FETCH' }) as
        | { ok: true; result: DirectFetchResult }
        | { ok: false; error: string };
      if (response?.ok) setResult(response.result);
      else setErr(response?.error ?? 'sem resposta');
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="logs-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <button className="logs-export-btn" onClick={handleClick} disabled={busy}>
        {busy ? 'Testando...' : 'POC: fetch direto Meta TS'}
      </button>
      {err && <span className="logs-feedback">erro: {err}</span>}
      {result && (
        <pre style={{
          fontSize: 11,
          background: 'var(--bg-secondary, #f5f5f5)',
          padding: 8,
          borderRadius: 4,
          overflow: 'auto',
          maxHeight: 280,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
{`status: ${result.status}
ok: ${result.ok}
content-type: ${result.contentType}
bodyLength: ${result.bodyLength}
${result.errorMessage ? 'error: ' + result.errorMessage + '\n' : ''}
token:
  isJwt: ${result.tokenInfo.isJwt}
  expiresInSec: ${result.tokenInfo.expiresInSec ?? 'n/a'}
  ageMs: ${result.tokenInfo.ageMs ?? 'n/a'}

response headers:
${Object.entries(result.responseHeaders).map(([k, v]) => `  ${k}: ${v}`).join('\n') || '  (none)'}

body:
${result.bodyPreview || '(empty)'}`}
        </pre>
      )}
    </div>
  );
}

function DebugMetaXTest() {
  const [ctx, setCtx] = useState<'morning' | 'exit_gate' | 'snooze' | 'afternoon_notif'>('morning');
  const handleOpenPopup = () => {
    chrome.runtime.sendMessage({ type: 'TEST_META_X_POPUP', ctx });
  };
  const handleReset = () => {
    chrome.storage.local.remove('metaXState');
  };
  return (
    <div className="logs-actions">
      <select value={ctx} onChange={e => setCtx(e.target.value as typeof ctx)}>
        <option value="morning">manhã (1º ponto)</option>
        <option value="exit_gate">gate da saída</option>
        <option value="snooze">snooze (30min depois)</option>
        <option value="afternoon_notif">16h</option>
      </select>
      <button className="logs-export-btn" onClick={handleOpenPopup}>
        Testar Meta X
      </button>
      <button className="logs-clear-btn" onClick={handleReset}>
        Reset semana
      </button>
    </div>
  );
}

function DebugReminderTest() {
  const [slot, setSlot] = useState<'entrada' | 'almoco' | 'volta' | 'saida'>('almoco');
  const handleClick = () => {
    chrome.runtime.sendMessage({ type: 'TEST_PUNCH_REMINDER', slot, time: '12:00' });
  };
  return (
    <div className="logs-actions">
      <select value={slot} onChange={e => setSlot(e.target.value as 'entrada' | 'almoco' | 'volta' | 'saida')}>
        <option value="entrada">entrada</option>
        <option value="almoco">almoço</option>
        <option value="volta">volta</option>
        <option value="saida">saída</option>
      </select>
      <button className="logs-export-btn" onClick={handleClick}>
        Testar lembrete
      </button>
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

function MetaNetLogActions() {
  const [busy, setBusy] = useState<'export' | 'clear' | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  const handleExport = async () => {
    setBusy('export');
    setFeedback('');
    try {
      const n = await exportMetaNetLog();
      setFeedback(`Tráfego exportado (${n} requests).`);
    } catch (_) {
      setFeedback('Falha ao exportar tráfego.');
    }
    setBusy(null);
  };

  const handleClear = async () => {
    setBusy('clear');
    setFeedback('');
    try {
      await clearMetaNetLog();
      setFeedback('Tráfego limpo.');
    } catch (_) {
      setFeedback('Falha ao limpar tráfego.');
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
        {busy === 'export' ? 'Exportando...' : 'Exportar tráfego Meta'}
      </button>
      <button
        className="logs-clear-btn"
        onClick={handleClear}
        disabled={busy !== null}
      >
        {busy === 'clear' ? 'Limpando...' : 'Limpar tráfego Meta'}
      </button>
      {feedback && <span className="logs-feedback">{feedback}</span>}
    </div>
  );
}

const SOUND_MAX_BYTES = 500 * 1024;
const SOUND_ACCEPTED_MIME = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg'];

interface SoundSettingsProps {
  settings: Settings;
  onChange: (partial: Partial<Settings>) => void;
}

function SoundSettings({ settings, onChange }: SoundSettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [feedback, setFeedback] = useState('');
  const hasCustom = !!settings.customSoundDataUrl;
  const enabled = settings.soundEnabled;

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!SOUND_ACCEPTED_MIME.includes(file.type)) {
      setFeedback('Formato inválido. Use MP3, WAV ou OGG.');
      return;
    }
    if (file.size > SOUND_MAX_BYTES) {
      setFeedback(`Arquivo muito grande (${Math.round(file.size / 1024)} KB). Máximo: 500 KB.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange({ customSoundDataUrl: dataUrl });
      setFeedback(`Som personalizado: ${file.name}`);
    } catch {
      setFeedback('Falha ao ler arquivo.');
    }
  };

  const handleReset = () => {
    onChange({ customSoundDataUrl: null });
    setFeedback('Som padrão restaurado.');
  };

  const safeVolume = typeof settings.soundVolume === 'number' && Number.isFinite(settings.soundVolume)
    ? Math.max(0, Math.min(1, settings.soundVolume))
    : 1;

  const handleTest = () => {
    audioRef.current?.pause();
    const src = settings.customSoundDataUrl || chrome.runtime.getURL('sounds/punch-reminder.mp3');
    const audio = new Audio(src);
    audio.volume = safeVolume;
    audioRef.current = audio;
    audio.play().catch(() => setFeedback('Falha ao tocar som.'));
  };

  const volumePct = Math.round(safeVolume * 100);

  return (
    <div className="sound-settings">
      <div className="setting-row">
        <label htmlFor="sound-enabled">Som no lembrete</label>
        <input
          id="sound-enabled"
          type="checkbox"
          className="setting-checkbox"
          checked={enabled}
          onChange={e => onChange({ soundEnabled: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <label htmlFor="sound-volume">Volume</label>
        <div className="sound-volume">
          <input
            id="sound-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumePct}
            disabled={!enabled}
            onChange={e => onChange({ soundVolume: parseInt(e.target.value, 10) / 100 })}
          />
          <span className="sound-volume-value">{volumePct}%</span>
        </div>
      </div>
      <div className="sound-actions">
        <button className="logs-export-btn" onClick={handlePickFile} disabled={!enabled}>
          Escolher arquivo...
        </button>
        {hasCustom && (
          <button className="logs-export-btn" onClick={handleReset} disabled={!enabled}>
            Restaurar padrão
          </button>
        )}
        <button className="logs-export-btn" onClick={handleTest} disabled={!enabled}>
          Testar
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
      <div className="sound-hint">MP3, WAV ou OGG · máx. 500 KB</div>
      <div className="sound-status">
        <span className="sound-status-label">
          {hasCustom ? 'Usando som personalizado.' : 'Usando som padrão.'}
        </span>
        {feedback && <span className="logs-feedback">{feedback}</span>}
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
