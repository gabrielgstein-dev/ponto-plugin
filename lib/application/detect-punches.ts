import type { IPunchProvider, IPunchDetector } from '../domain/interfaces';
import type { PunchDetectionResult } from '../domain/types';

const PENDING_TTL_MS = 120000;
let _pendingPunches: { time: string; ts: number }[] = [];

export function addPendingPunch(time: string): void {
  _pendingPunches = _pendingPunches.filter(p => Date.now() - p.ts < PENDING_TTL_MS);
  if (!_pendingPunches.some(p => p.time === time)) {
    _pendingPunches.push({ time, ts: Date.now() });
    console.log('[Senior Ponto] Pending punch adicionado:', time);
  }
}

function getActivePendingPunches(): string[] {
  _pendingPunches = _pendingPunches.filter(p => Date.now() - p.ts < PENDING_TTL_MS);
  return _pendingPunches.map(p => p.time);
}

export class PunchDetector implements IPunchDetector {
  private providers: IPunchProvider[];

  constructor(providers: IPunchProvider[]) {
    this.providers = [...providers].sort((a, b) => a.priority - b.priority);
  }

  async detect(date: Date, aggressive = false): Promise<PunchDetectionResult | null> {
    const PRIMARY_MAX = 2;
    const primaryTimes: string[] = [];
    const primarySources: string[] = [];

    for (const provider of this.providers) {
      if (provider.priority > PRIMARY_MAX) break;
      try {
        const times = await provider.fetchPunches(date, aggressive);
        if (times.length > 0) {
          console.log(`[Senior Ponto] ${provider.name}: ${times.length} batimento(s) →`, times.join(', '));
          primaryTimes.push(...times);
          primarySources.push(provider.name);
        } else if (aggressive) {
          console.log(`[Senior Ponto] ${provider.name}: sem resultados`);
        }
      } catch (e) {
        if (aggressive) {
          console.warn(`[Senior Ponto] ${provider.name} falhou:`, (e as Error).message);
        }
      }
    }

    if (primaryTimes.length > 0) {
      const unique = [...new Set(primaryTimes)].sort();
      const merged = this.mergePending(unique);
      return { times: merged, source: primarySources.join('+') };
    }

    for (const provider of this.providers) {
      if (provider.priority <= PRIMARY_MAX) continue;
      try {
        const times = await provider.fetchPunches(date, aggressive);
        if (times.length > 0) {
          console.log(`[Senior Ponto] ${provider.name}: ${times.length} batimento(s) →`, times.join(', '));
          return { times: this.mergePending(times), source: provider.name };
        } else if (aggressive) {
          console.log(`[Senior Ponto] ${provider.name}: sem resultados`);
        }
      } catch (e) {
        if (aggressive) {
          console.warn(`[Senior Ponto] ${provider.name} falhou:`, (e as Error).message);
        }
      }
    }

    const pending = getActivePendingPunches();
    if (pending.length > 0) {
      return { times: [...new Set(pending)].sort(), source: 'pending' };
    }

    return null;
  }

  private mergePending(times: string[]): string[] {
    const pending = getActivePendingPunches();
    if (pending.length === 0) return times;
    const set = new Set(times);
    for (const p of pending) set.add(p);
    const merged = [...set].sort();
    if (merged.length !== times.length) {
      console.log('[Senior Ponto] Pending punches mergeados:', merged.join(', '));
    }
    return merged;
  }
}
