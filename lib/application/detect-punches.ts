import type { IPunchProvider, IPunchDetector } from '../domain/interfaces';
import type { PunchDetectionResult } from '../domain/types';
import { debugLog, debugWarn } from '../domain/debug';
import { timeToMinutes } from '../domain/time-utils';

const PENDING_TTL_MS = 120000;
let _pendingPunches: { time: string; ts: number }[] = [];

// Ordena "HH:MM" cronologicamente. Sem isso, .sort() lexicográfico funciona
// só por coincidência (24h zero-padded) — basta um "9:30" sem pad pra furar
// a invariante de slots por índice (1º=entrada, 2º=almoço, 3º=volta, 4º=saída).
function sortTimes(times: string[]): string[] {
  return [...times].sort((a, b) => (timeToMinutes(a) ?? 0) - (timeToMinutes(b) ?? 0));
}

export function addPendingPunch(time: string): void {
  _pendingPunches = _pendingPunches.filter(p => Date.now() - p.ts < PENDING_TTL_MS);
  if (!_pendingPunches.some(p => p.time === time)) {
    _pendingPunches.push({ time, ts: Date.now() });
    debugLog('Pending punch adicionado:', time);
    void savePendingPunches();
  }
}

async function savePendingPunches(): Promise<void> {
  try {
    await chrome.storage.local.set({ pendingPunches: _pendingPunches });
  } catch (e) {
    debugWarn('savePendingPunches falhou:', (e as Error).message);
  }
}

export async function loadPendingPunches(): Promise<void> {
  try {
    const data = await chrome.storage.local.get('pendingPunches');
    if (Array.isArray(data.pendingPunches)) {
      const now = Date.now();
      _pendingPunches = (data.pendingPunches as { time: string; ts: number }[]).filter(p => now - p.ts < PENDING_TTL_MS);
      if (_pendingPunches.length > 0) {
        debugLog('Pending punches restaurados:', _pendingPunches.map(p => p.time).join(', '));
      }
    }
  } catch (e) {
    debugWarn('loadPendingPunches falhou:', (e as Error).message);
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
    debugLog(`PunchDetector.detect: iniciando (aggressive=${aggressive}, providers=${this.providers.length})`);
    const PRIMARY_MAX = 2;
    const primaryTimes: string[] = [];
    const primarySources: string[] = [];

    for (const provider of this.providers) {
      if (provider.priority > PRIMARY_MAX) break;
      debugLog(`PunchDetector: tentando provider ${provider.name} (priority=${provider.priority})`);
      try {
        const times = await provider.fetchPunches(date, aggressive);
        if (times.length > 0) {
          debugLog(`${provider.name}: ${times.length} batimento(s) →`, times.join(', '));
          primaryTimes.push(...times);
          primarySources.push(provider.name);
        } else if (aggressive) {
          debugLog(`${provider.name}: sem resultados`);
        }
      } catch (e) {
        if (aggressive) {
          debugWarn(`${provider.name} falhou:`, (e as Error).message);
        }
      }
    }

    if (primaryTimes.length > 0) {
      const unique = sortTimes([...new Set(primaryTimes)]);
      const merged = this.mergePending(unique);
      debugLog(`PunchDetector: primary providers retornaram ${merged.length} batimentos (sources: ${primarySources.join('+')})`);
      return { times: merged, source: primarySources.join('+') };
    }
    debugLog('PunchDetector: nenhum primary provider retornou dados, tentando fallback...');

    for (const provider of this.providers) {
      if (provider.priority <= PRIMARY_MAX) continue;
      debugLog(`PunchDetector: tentando fallback provider ${provider.name} (priority=${provider.priority})`);
      try {
        const times = await provider.fetchPunches(date, aggressive);
        if (times.length > 0) {
          debugLog(`${provider.name}: ${times.length} batimento(s) →`, times.join(', '));
          return { times: this.mergePending(times), source: provider.name };
        } else if (aggressive) {
          debugLog(`${provider.name}: sem resultados`);
        }
      } catch (e) {
        if (aggressive) {
          debugWarn(`${provider.name} falhou:`, (e as Error).message);
        }
      }
    }

    const pending = getActivePendingPunches();
    if (pending.length > 0) {
      debugLog(`PunchDetector: usando pending punches (${pending.length})`);
      return { times: sortTimes([...new Set(pending)]), source: 'pending' };
    }

    if (aggressive) {
      debugWarn('PunchDetector: nenhum provider retornou dados (aggressive=true)');
    } else {
      debugLog('PunchDetector: nenhum provider retornou dados');
    }
    return null;
  }

  private mergePending(times: string[]): string[] {
    const pending = getActivePendingPunches();
    if (pending.length === 0) return times;
    const set = new Set(times);
    for (const p of pending) set.add(p);
    const merged = sortTimes([...set]);
    if (merged.length !== times.length) {
      debugLog('Pending punches mergeados:', merged.join(', '));
    }
    return merged;
  }
}
