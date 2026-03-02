import { useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_MODE_KEY = 'senior-ponto-theme-mode';

// Inicializar o tema antes do React renderizar
const getInitialTheme = (): ThemeMode => {
  const stored = localStorage.getItem(THEME_MODE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
};

const getInitialDarkMode = (): boolean => {
  const themeMode = getInitialTheme();
  if (themeMode === 'dark') return true;
  if (themeMode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// Aplicar tema imediatamente
if (typeof window !== 'undefined') {
  const isDark = getInitialDarkMode();
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [isDark, setIsDark] = useState(getInitialDarkMode);

  useEffect(() => {
    const updateTheme = () => {
      let shouldBeDark = false;
      
      if (themeMode === 'dark') {
        shouldBeDark = true;
      } else if (themeMode === 'light') {
        shouldBeDark = false;
      } else {
        shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      setIsDark(shouldBeDark);
      
      const root = document.documentElement;
      if (shouldBeDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    updateTheme();

    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', updateTheme);
      return () => mediaQuery.removeEventListener('change', updateTheme);
    }
  }, [themeMode]);

  const setTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem(THEME_MODE_KEY, mode);
  };

  const toggleTheme = () => {
    if (themeMode === 'light') {
      setTheme('dark');
    } else if (themeMode === 'dark') {
      setTheme('light');
    } else {
      setTheme(isDark ? 'light' : 'dark');
    }
  };

  return {
    themeMode,
    isDark,
    setTheme,
    toggleTheme,
  };
}
