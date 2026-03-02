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
      sans: "'DM Sans', sans-serif",
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
      sans: "'DM Sans', sans-serif",
    },
  },
  meta: {
    name: 'Meta',
    colors: {
      bg: '#f4f7fb',
      surface: '#ffffff',
      surface2: '#eaf0f8',
      border: '#ccd8e8',
      accent: '#0044dd',
      accent2: '#0035b0',
      warn: '#d97706',
      danger: '#dc2626',
      text: '#18243a',
      textDim: '#3d5470',
      textDimmer: '#6b83a0',
    },
    darkColors: {
      bg: '#161b27',
      surface: '#1e2535',
      surface2: '#263044',
      border: '#2e3d56',
      accent: '#4d84f5',
      accent2: '#2b68e8',
      warn: '#f0a030',
      danger: '#e05555',
      text: '#dde6f0',
      textDim: '#8fa3be',
      textDimmer: '#556f8f',
    },
    fonts: {
      mono: "'Space Mono', monospace",
      sans: "'DM Sans', sans-serif",
    },
  },
};
