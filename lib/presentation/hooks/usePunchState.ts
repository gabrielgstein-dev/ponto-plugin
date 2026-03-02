import { useState, useEffect, useCallback, useRef } from 'react';
import type { PunchState, Settings } from '../../domain/types';
import { DEFAULT_SETTINGS, DEFAULT_STATE } from '../../domain/types';
import { ChromeStateRepository } from '../../infrastructure/chrome-storage';
import { applyPartialState, applySettings, resetState, resetNotifScheduled, state, settings } from '../../application/state';
import { calcHorarios } from '../../application/calc-schedule';

const repo = new ChromeStateRepository();

export function usePunchState() {
  const [punchState, setPunchState] = useState<PunchState>({ ...DEFAULT_STATE });
  const [userSettings, setUserSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    repo.loadState().then(({ state: s, settings: st }) => {
      applyPartialState(s);
      applySettings(st);
      calcHorarios();
      setPunchState({ ...state });
      setUserSettings({ ...settings });
      setLoading(false);
    });
  }, []);

  const refresh = useCallback(() => {
    calcHorarios();
    setPunchState({ ...state });
  }, []);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    applySettings(partial);
    setUserSettings({ ...settings });
    repo.saveSettings(settings);
    calcHorarios();
    setPunchState({ ...state });
  }, []);

  const saveCurrentState = useCallback(() => {
    repo.saveState(state);
  }, []);

  const clearState = useCallback(() => {
    resetState();
    resetNotifScheduled();
    repo.saveState(state);
    calcHorarios();
    setPunchState({ ...state });
  }, []);

  return {
    punchState,
    settings: userSettings,
    loading,
    refresh,
    updateSettings,
    saveCurrentState,
    clearState,
    stateRepo: repo,
  };
}
