import type { IPunchProvider } from '../../domain/interfaces';
import { findSeniorTab } from './tab-utils';

export class SeniorScraperProvider implements IPunchProvider {
  readonly name = 'scraper';
  readonly priority = 4;

  async fetchPunches(_date: Date): Promise<string[]> {
    const tab = await findSeniorTab();
    if (!tab?.id) return [];

    try {
      const results = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_TIMES' });
      if (results?.times && Array.isArray(results.times)) {
        return results.times;
      }
    } catch (_) {}

    return [];
  }
}
