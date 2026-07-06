export interface Theme {
  name: string;
  colors: {
    bg: string;
    surface: string;
    surface2: string;
    border: string;
    accent: string;
    accent2: string;
    warn: string;
    danger: string;
    text: string;
    textDim: string;
    textDimmer: string;
  };
  darkColors?: {
    bg: string;
    surface: string;
    surface2: string;
    border: string;
    accent: string;
    accent2: string;
    warn: string;
    danger: string;
    text: string;
    textDim: string;
    textDimmer: string;
  };
  fonts: {
    mono: string;
    sans: string;
  };
}

export const themes: Record<string, Theme> = {
  dark: {
    name: 'Dark',
    colors: {
      bg: '#0f1117',
      surface: '#181b25',
      surface2: '#1e2230',
      border: '#2a2f40',
      accent: '#4ade80',
      accent2: '#22d3ee',
      warn: '#fbbf24',
      danger: '#f87171',
      text: '#e8eaf0',
      textDim: '#9da7b8',
      textDimmer: '#6b7589',
    },
    fonts: {
      mono: "'Space Mono', monospace",
      sans: "'Figtree', sans-serif",
    },
  },
  light: {
    name: 'Light',
    colors: {
      bg: '#ffffff',
      surface: '#f8fafc',
      surface2: '#f1f5f9',
      border: '#e2e8f0',
      accent: '#16a34a',
      accent2: '#0891b2',
      warn: '#d97706',
      danger: '#dc2626',
      text: '#1e293b',
      textDim: '#64748b',
      textDimmer: '#94a3b8',
    },
    fonts: {
      mono: "'Space Mono', monospace",
      sans: "'Figtree', sans-serif",
    },
  },
  insi: {
    name: 'insi',
    colors: {
      bg: '#f5f5f7',
      surface: '#ffffff',
      surface2: '#ebebf0',
      border: '#d9d9e3',
      accent: '#421589',
      accent2: '#320078',
      warn: '#b96800',
      danger: '#a8215f',
      text: '#1a1b3a',
      textDim: '#4a4b5c',
      textDimmer: '#6b6d7d',
    },
    darkColors: {
      bg: '#14101e',
      surface: '#1d1730',
      surface2: '#271f3d',
      border: '#36294f',
      accent: '#9d7bf0',
      accent2: '#7e5ce6',
      warn: '#e0a030',
      danger: '#e0558f',
      text: '#ece8f5',
      textDim: '#b3a9c9',
      textDimmer: '#7e7099',
    },
    fonts: {
      mono: "'Space Mono', monospace",
      sans: "'Figtree', sans-serif",
    },
  },
};

// Alias retrocompatível: builds/configs antigas que usam THEME='meta'
// continuam resolvendo para a paleta insi (rebrand de marca, mesma identidade).
themes.meta = themes.insi;
