import type { IPunchProvider } from '../../domain/interfaces';
import { todayDateStr } from '../../domain/time-utils';

let _emptyTs = 0;
const EMPTY_TTL_MS = 30000;

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
        if (aggressive) console.log('[Senior Ponto] localStorage: nenhuma aba senior.com.br (total abas:', allTabs.length, ')');
        _emptyTs = Date.now();
        return [];
      }
      if (aggressive) console.log('[Senior Ponto] localStorage: aba Senior encontrada (id:', seniorTab.id, 'url:', seniorTab.url?.substring(0, 60), ')');

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
        if (aggressive) console.log('[Senior Ponto] localStorage: clockingEventsStorage NAO existe na aba');
        _emptyTs = Date.now();
        return [];
      }
      console.log('[Senior Ponto] localStorage: clockingEventsStorage encontrado, tamanho:', raw.length);

      const parsed = JSON.parse(raw);
      const times = this.extractTodayPunches(parsed);
      if (times.length > 0) {
        _emptyTs = 0; // resetar cache quando encontrar dados
        console.log('[Senior Ponto] localStorage: batimentos hoje:', times);
      } else {
        _emptyTs = Date.now();
      }
      return times;
    } catch (e) {
      if (aggressive) console.warn('[Senior Ponto] localStorage erro:', (e as Error).message);
      return [];
    }
  }

  private extractTodayPunches(data: Record<string, unknown>): string[] {
    const today = todayDateStr();
    const times: string[] = [];

    for (const empData of Object.values(data)) {
      if (!empData || typeof empData !== 'object') continue;
      const eventArrays = Object.values(empData as Record<string, unknown>).filter(v => Array.isArray(v)) as Array<Array<Record<string, string>>>;

      for (const events of eventArrays) {
        for (const ev of events) {
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
    }

    return [...new Set(times)].sort();
  }
}
