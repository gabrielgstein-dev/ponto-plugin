/**
 * Constrói um arquivo .json com os logs e dispara o download.
 * Usa Blob + a.download (sem necessidade da permissão "downloads").
 */
import { getLogs } from '../domain/log-store';
import { APP_NAME } from '../domain/build-flags';
import { padZero } from '../domain/time-utils';

function buildFilename(now: Date): string {
  const date = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
  const time = `${padZero(now.getHours())}${padZero(now.getMinutes())}${padZero(now.getSeconds())}`;
  /* v8 ignore next -- fallback caso APP_NAME não tenha caracteres alfanuméricos */
  const slug = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
  return `${slug}-logs-${date}-${time}.json`;
}

export async function exportLogs(): Promise<void> {
  const entries = await getLogs();
  const payload = {
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    /* v8 ignore next -- navigator é sempre definido em popup/sidepanel/SW */
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildFilename(new Date());
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
