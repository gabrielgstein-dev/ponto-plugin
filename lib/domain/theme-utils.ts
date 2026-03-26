import { themes, Theme } from './themes';
import { THEME } from './build-flags';

export function getTheme(): Theme {
  return themes[THEME] || themes.dark;
}

export function generateCSSVariables(theme: Theme = getTheme()): string {
  const vars: string[] = [];
  
  // Light mode variables
  Object.entries(theme.colors).forEach(([key, value]) => {
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    vars.push(`${cssVar}: ${value};`);
  });
  
  // Dark mode variables (if available)
  if (theme.darkColors) {
    vars.push('');
    Object.entries(theme.darkColors).forEach(([key, value]) => {
      const cssVar = `--dark-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      vars.push(`${cssVar}: ${value};`);
    });
  }
  
  // Font variables
  Object.entries(theme.fonts).forEach(([key, value]) => {
    const cssVar = `--${key}`;
    vars.push(`${cssVar}: ${value};`);
  });
  
  return vars.join('\n  ');
}

export const currentThemeCSS = generateCSSVariables();
