import type { IPunchProvider } from '../../domain/interfaces';
import { todayDateStr } from '../../domain/time-utils';
import { debugLog, debugWarn } from '../../domain/debug';

let _emptyTs = 0;
const EMPTY_TTL_MS = 30000;

export function resetSeniorStorageCache(): void {
  _emptyTs = 0;
}

export class SeniorStoragePunchProvider implements IPunchProvider {
  readonly name = 'localStorage';
  readonly priority = 2;

  async fetchPunches(_date: Date, aggressive = false): Promise<string[]> {
    // No polling, pula se o último check foi vazio nos últimos 30s
    if (!aggressive && Date.now() - _emptyTs < EMPTY_TTL_MS) return [];

    try {
      const allTabs = await chrome.tabs.query({});
      const seniorTab = allTabs.find((t: { url?: string; id?: number }) => t.url?.includes('senior.com.br'));
      if (!seniorTab?.id) {
        if (aggressive) debugLog('localStorage: nenhuma aba senior.com.br (total abas:', allTabs.length, ')');
        _emptyTs = Date.now();
        return [];
      }
      if (aggressive) debugLog('localStorage: aba Senior encontrada (id:', seniorTab.id, 'url:', seniorTab.url?.substring(0, 60), ')');

      const results = await chrome.scripting.executeScript({
        target: { tabId: seniorTab.id },
        func: () => {
          const raw = localStorage.getItem('clockingEventsStorage');
          if (!raw) return null;
          return raw;
        },
      });

      const raw = results?.[0]?.result;
      if (!raw) {
        if (aggressive) debugLog('localStorage: clockingEventsStorage NAO existe na aba');
        _emptyTs = Date.now();
        return [];
      }
      debugLog('localStorage: clockingEventsStorage encontrado, tamanho:', raw.length);

      const parsed = JSON.parse(raw);
      const times = this.extractTodayPunches(parsed);
      if (times.length > 0) {
        _emptyTs = 0; // resetar cache quando encontrar dados
        debugLog('localStorage: batimentos hoje:', times);
      } else {
        _emptyTs = Date.now();
      }
      return times;
    } catch (e) {
      if (aggressive) debugWarn('localStorage erro:', (e as Error).message);
      return [];
    }
  }

  private extractTodayPunches(data: Record<string, unknown>): string[] {
    const today = todayDateStr();
    const times: string[] = [];

    for (const empData of Object.values(data)) {
      if (!empData || typeof empData !== 'object') continue;
      const emp = empData as Record<string, unknown>;
      const imported = emp.clockingEventImported;
      if (!Array.isArray(imported)) continue;

      for (const ev of imported as Array<Record<string, string>>) {
        const evDate = ev.dateEvent || ev.date || ev.dateTime || '';
        if (!evDate.startsWith(today)) continue;

        const timeVal = ev.timeEvent || ev.time || '';
        const timeMatch = timeVal.match(/(\d{2}):(\d{2})/);
        if (timeMatch) {
          times.push(`${timeMatch[1]}:${timeMatch[2]}`);
        } else {
          const dtMatch = evDate.match(/T(\d{2}):(\d{2})/);
          if (dtMatch) times.push(`${dtMatch[1]}:${dtMatch[2]}`);
        }
      }
    }

    return [...new Set(times)].sort();
  }
}
