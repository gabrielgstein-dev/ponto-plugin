import type { IStateRepository } from '../domain/interfaces';
import type { PunchState, Settings } from '../domain/types';
import { DEFAULT_SETTINGS, DEFAULT_STATE } from '../domain/types';

export class ChromeStateRepository implements IStateRepository {
  async loadState(): Promise<{ state: PunchState; settings: Settings }> {
    const data = await chrome.storage.local.get(['pontoState', 'pontoSettings', 'pontoDate']);
    const today = new Date().toDateString();

    let state = { ...DEFAULT_STATE };
    let settings = { ...DEFAULT_SETTINGS };

    if (data.pontoDate !== today) {
      await chrome.storage.local.set({ pontoDate: today, pontoState: null });
    } else if (data.pontoState) {
      state = { ...state, ...data.pontoState };
    }

    if (data.pontoSettings) {
      settings = { ...settings, ...data.pontoSettings };
    }

    return { state, settings };
  }

  async saveState(state: PunchState): Promise<void> {
    const today = new Date().toDateString();
    await chrome.storage.local.set({ pontoState: state, pontoDate: today });
  }

  async saveSettings(settings: Settings): Promise<void> {
    await chrome.storage.local.set({ pontoSettings: settings });
  }
}
