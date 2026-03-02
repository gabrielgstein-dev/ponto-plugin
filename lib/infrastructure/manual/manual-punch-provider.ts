import type { IPunchProvider } from '../../domain/interfaces';
import { todayDateStr, padZero } from '../../domain/time-utils';

const DISPLAY_DAYS = 7;

function cutoffDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - DISPLAY_DAYS);
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

function pruneOldDays(punches: Record<string, string[]>): Record<string, string[]> {
  const cutoff = cutoffDateStr();
  for (const date of Object.keys(punches)) {
    if (date < cutoff) delete punches[date];
  }
  return punches;
}

export class ManualPunchProvider implements IPunchProvider {
  readonly name = 'manual';
  readonly priority = 0;

  async fetchPunches(_date: Date): Promise<string[]> {
    const today = todayDateStr();
    const data = await chrome.storage.local.get(['manualPunches']);
    const punches: Record<string, string[]> = data.manualPunches || {};
    return (punches[today] || []).sort();
  }
}

export async function saveManualPunch(time: string): Promise<void> {
  const today = todayDateStr();
  const data = await chrome.storage.local.get(['manualPunches']);
  const punches: Record<string, string[]> = data.manualPunches || {};
  if (!punches[today]) punches[today] = [];
  if (!punches[today].includes(time)) {
    punches[today].push(time);
    punches[today].sort();
  }
  await chrome.storage.local.set({ manualPunches: punches });
}

export async function removeManualPunch(time: string): Promise<void> {
  const today = todayDateStr();
  const data = await chrome.storage.local.get(['manualPunches']);
  const punches: Record<string, string[]> = data.manualPunches || {};
  if (!punches[today]) return;
  punches[today] = punches[today].filter((t: string) => t !== time);
  await chrome.storage.local.set({ manualPunches: punches });
}

export async function getManualPunchHistory(): Promise<Record<string, string[]>> {
  const data = await chrome.storage.local.get(['manualPunches']);
  return pruneOldDays(data.manualPunches || {});
}

export async function saveManualPunchForDate(date: string, time: string): Promise<void> {
  const data = await chrome.storage.local.get(['manualPunches']);
  const punches: Record<string, string[]> = data.manualPunches || {};
  if (!punches[date]) punches[date] = [];
  if (!punches[date].includes(time)) {
    punches[date].push(time);
    punches[date].sort();
  }
  await chrome.storage.local.set({ manualPunches: punches });
}

export async function removeManualPunchForDate(date: string, time: string): Promise<void> {
  const data = await chrome.storage.local.get(['manualPunches']);
  const punches: Record<string, string[]> = data.manualPunches || {};
  if (!punches[date]) return;
  punches[date] = punches[date].filter((t: string) => t !== time);
  if (punches[date].length === 0) delete punches[date];
  await chrome.storage.local.set({ manualPunches: punches });
}

export async function updateManualPunchForDate(date: string, oldTime: string, newTime: string): Promise<void> {
  const data = await chrome.storage.local.get(['manualPunches']);
  const punches: Record<string, string[]> = data.manualPunches || {};
  if (!punches[date]) return;
  punches[date] = punches[date].map((t: string) => t === oldTime ? newTime : t).sort();
  await chrome.storage.local.set({ manualPunches: punches });
}

