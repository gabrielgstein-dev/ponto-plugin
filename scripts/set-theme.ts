#!/usr/bin/env node

import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

const themes = ['dark', 'light', 'meta'] as const;
type Theme = typeof themes[number];

const buildFlagsPath = resolve(__dirname, '../lib/domain/build-flags.json');

function setTheme(theme: Theme) {
  if (!themes.includes(theme)) {
    console.error(`❌ Tema inválido: ${theme}`);
    console.log(`Temas disponíveis: ${themes.join(', ')}`);
    process.exit(1);
  }

  try {
    const buildFlags = JSON.parse(readFileSync(buildFlagsPath, 'utf-8'));
    buildFlags.THEME = theme;
    writeFileSync(buildFlagsPath, JSON.stringify(buildFlags, null, 2));
    console.log(`✅ Tema alterado para: ${theme}`);
    console.log('⚠️ Execute `pnpm build` para aplicar as mudanças');
  } catch (error) {
    console.error('❌ Erro ao alterar tema:', error);
    process.exit(1);
  }
}

const theme = process.argv[2] as Theme;

if (!theme) {
  console.log('Uso: pnpm set-theme <tema>');
  console.log(`Temas disponíveis: ${themes.join(', ')}`);
  process.exit(0);
}

setTheme(theme);
