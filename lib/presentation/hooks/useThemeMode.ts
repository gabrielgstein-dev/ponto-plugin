import { useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'senior-ponto-theme-mode';

function isValidTheme(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

const getInitialTheme = (): ThemeMode => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (isValidTheme(stored)) return stored;
  return 'system';
};

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDarkClass(dark: boolean) {
  const root = document.documentElement;
  if (dark) root.classList.add('dark');
  else root.classList.remove('dark');
}

if (typeof window !== 'undefined') {
  applyDarkClass(resolveDark(getInitialTheme()));
  chrome.storage.local.get(THEME_STORAGE_KEY).then((data) => {
    const remote = data[THEME_STORAGE_KEY];
    if (isValidTheme(remote) && remote !== getInitialTheme()) {
      localStorage.setItem(THEME_STORAGE_KEY, remote);
      applyDarkClass(resolveDark(remote));
    }
  }).catch(() => {});
}

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [isDark, setIsDark] = useState(() => resolveDark(getInitialTheme()));

  useEffect(() => {
    const dark = resolveDark(themeMode);
    setIsDark(dark);
    applyDarkClass(dark);

    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        const d = resolveDark(themeMode);
        setIsDark(d);
        applyDarkClass(d);
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [themeMode]);

  useEffect(() => {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      const change = changes[THEME_STORAGE_KEY];
      if (!change || !isValidTheme(change.newValue)) return;
      const remote = change.newValue;
      localStorage.setItem(THEME_STORAGE_KEY, remote);
      setThemeMode(remote);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: mode });
  };

  const toggleTheme = () => {
    if (themeMode === 'light') setTheme('dark');
    else if (themeMode === 'dark') setTheme('light');
    else setTheme(isDark ? 'light' : 'dark');
  };

  return { themeMode, isDark, setTheme, toggleTheme };
}
