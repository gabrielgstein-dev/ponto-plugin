/**
 * Constrói um arquivo .json com os logs e dispara o download.
 * Usa Blob + a.download (sem necessidade da permissão "downloads").
 *
 * Encoding: TextEncoder garante UTF-8 puro (caracteres como "ã"/"ç" não
 * viram mojibake quando o leitor não respeita `;charset=utf-8`).
 */
import { getLogs, type LogEntry, type LogLevel } from '../domain/log-store';
import { APP_NAME } from '../domain/build-flags';
import { padZero } from '../domain/time-utils';

function buildFilename(now: Date): string {
  const date = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
  const time = `${padZero(now.getHours())}${padZero(now.getMinutes())}${padZero(now.getSeconds())}`;
  /* v8 ignore next -- fallback caso APP_NAME não tenha caracteres alfanuméricos */
  const slug = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
  return `${slug}-logs-${date}-${time}.json`;
}

function getPluginVersion(): string {
  /* v8 ignore next 3 -- runtime nem manifest existem em testes */
  const rt = (typeof chrome !== 'undefined' ? chrome.runtime : undefined) as
    | { getManifest?: () => { version?: string } }
    | undefined;
  return rt?.getManifest?.()?.version ?? 'unknown';
}

function summarizeEntries(entries: LogEntry[]): {
  total: number;
  byLevel: Record<LogLevel, number>;
  span: { from: string; to: string } | null;
} {
  const byLevel: Record<LogLevel, number> = { log: 0, warn: 0, error: 0 };
  for (const e of entries) byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
  const span = entries.length === 0
    ? null
    : { from: new Date(entries[0].ts).toISOString(), to: new Date(entries[entries.length - 1].ts).toISOString() };
  return { total: entries.length, byLevel, span };
}

export async function exportLogs(): Promise<void> {
  const entries = await getLogs();
  const payload = {
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    pluginVersion: getPluginVersion(),
    /* v8 ignore next -- navigator é sempre definido em popup/sidepanel/SW */
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    summary: summarizeEntries(entries),
    entries,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const blob = new Blob([bytes], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildFilename(new Date());
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
