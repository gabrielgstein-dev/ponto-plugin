/**
 * Constrói um arquivo .json com o tráfego capturado da SPA Meta e dispara
 * o download. Lê via mensagem pro background (single-writer do buffer).
 */
import { APP_NAME } from '../domain/build-flags';
import { padZero } from '../domain/time-utils';
import type { MetaNetEntry } from '../domain/meta-net-log';

function buildFilename(now: Date): string {
  const date = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
  const time = `${padZero(now.getHours())}${padZero(now.getMinutes())}${padZero(now.getSeconds())}`;
  /* v8 ignore next -- fallback caso APP_NAME não tenha caracteres alfanuméricos */
  const slug = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
  return `${slug}-meta-net-${date}-${time}.json`;
}

async function fetchEntries(): Promise<MetaNetEntry[]> {
  const res = await chrome.runtime.sendMessage({ type: 'META_NETLOG_GET' });
  if (res?.ok && Array.isArray(res.entries)) return res.entries as MetaNetEntry[];
  return [];
}

function getPluginVersion(): string {
  /* v8 ignore next 3 -- runtime nem manifest existem em testes */
  const rt = (typeof chrome !== 'undefined' ? chrome.runtime : undefined) as
    | { getManifest?: () => { version?: string } }
    | undefined;
  return rt?.getManifest?.()?.version ?? 'unknown';
}

export async function exportMetaNetLog(): Promise<number> {
  const entries = await fetchEntries();
  const payload = {
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    pluginVersion: getPluginVersion(),
    /* v8 ignore next -- navigator é sempre definido em popup/sidepanel */
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    count: entries.length,
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
  return entries.length;
}

export async function clearMetaNetLog(): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'META_NETLOG_CLEAR' });
}
