import type { MetaXState } from './types';

export type MetaXTone = 'idle' | 'attention' | 'urgent' | 'done';

export interface MetaXStatus {
  tone: MetaXTone;
  label: string;
  shouldShow: boolean;
}

export const META_X_URL = 'https://app.teamculture.com.br/survey';

export function getIsoWeekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function hasRespondedThisWeek(state: MetaXState | null | undefined, now: Date): boolean {
  if (!state?.lastRespondedWeekKey) return false;
  return state.lastRespondedWeekKey === getIsoWeekKey(now);
}

export function getMetaXStatus(now: Date, state: MetaXState | null | undefined): MetaXStatus {
  const day = now.getDay();
  const responded = hasRespondedThisWeek(state, now);

  if (responded) {
    if (day === 2 || day === 3) {
      return { tone: 'done', label: 'Respondido ✓', shouldShow: true };
    }
    return { tone: 'idle', label: '', shouldShow: false };
  }

  if (day === 3) return { tone: 'urgent', label: 'Responda hoje', shouldShow: true };
  if (day === 2) return { tone: 'attention', label: 'Adiantar?', shouldShow: true };
  return { tone: 'idle', label: '', shouldShow: false };
}
