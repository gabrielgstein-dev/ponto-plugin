import { useState, useEffect, useCallback, useRef } from 'react';
import type { PunchState, Settings } from '../../domain/types';
import { DEFAULT_SETTINGS, DEFAULT_STATE } from '../../domain/types';
import { ChromeStateRepository } from '../../infrastructure/chrome-storage';
import { applyPartialState, applySettings, resetState, resetNotifScheduled, state, settings } from '../../application/state';
import { calcHorarios } from '../../application/calc-schedule';
import { clampHoraExtra } from '../../domain/hora-extra';

const repo = new ChromeStateRepository();

export function usePunchState() {
  const [punchState, setPunchState] = useState<PunchState>({ ...DEFAULT_STATE });
  const [userSettings, setUserSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    /* v8 ignore next -- StrictMode guard; second invocation is short-circuited */
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

  /**
   * Grava a hora extra do dia e manda o background rearmar os alarmes.
   *
   * O `RESCHEDULE_DAY` não é opcional: sem ele o `autopunch_saida` continuaria
   * armado pro horário antigo até o próximo backgroundDetect (10min, e mesmo
   * assim barrado pelo guard de hash) — a UI mostraria 18:00 e a batida sairia
   * 17:00. Salva ANTES de avisar, porque o background relê do storage.
   */
  const setHoraExtra = useCallback(async (minutes: number) => {
    applyPartialState({ horaExtra: clampHoraExtra(minutes) });
    calcHorarios();
    setPunchState({ ...state });
    await repo.saveState(state);
    try {
      await chrome.runtime.sendMessage({ type: 'RESCHEDULE_DAY' });
    } catch (_) {
      // Background dormindo/indisponível: o próximo backgroundDetect reagenda.
      // O valor já está persistido, então nada se perde.
    }
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
    setHoraExtra,
    clearState,
    stateRepo: repo,
  };
}
