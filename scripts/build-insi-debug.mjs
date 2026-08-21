#!/usr/bin/env node
/**
 * Build de DIAGNÓSTICO do Ponto Insi.
 *
 * Idêntico ao `build:insi`, mas com DEBUG, ENABLE_NETLOG_CAPTURE e
 * ENABLE_AUTO_PUNCH ligados:
 *   - ENABLE_NETLOG_CAPTURE liga a captura de TODAS as requests de QUALQUER
 *     site (netcap.content casa em <all_urls>), com URL/método/headers/body de
 *     request E response — exatamente o "todos os requests que eu faço".
 *   - DEBUG faz o botão "Exportar tráfego" aparecer nas Settings
 *     (SettingsPanel só mostra MetaNetLogActions quando DEBUG && NETLOG).
 *   - ENABLE_AUTO_PUNCH faz o bloco "Batida automática (Senior)" aparecer nas
 *     Settings. Sem ela o toggle simplesmente não renderiza. Continua desligada
 *     em runtime até o usuário marcar o toggle + os slots.
 *
 * IMPORTANTE: essas três flags são dev-only. O gate scripts/check-prod-flags.mjs
 * (workflow prod-flags.yml em PRs → master) barra elas ligadas. Por isso este
 * script SEMPRE restaura lib/domain/build-flags.json ao estado original ao fim
 * — inclusive se o build falhar. Nada dev-only fica staged.
 *
 * Uso:   pnpm build:insi:debug
 * Saída: .output/ponto-insi-<versão>-debug.zip
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync, rmSync } from 'fs';
import { execSync } from 'child_process';

const FLAGS = 'lib/domain/build-flags.json';
const BAK = 'lib/domain/build-flags.json.debugbak';

copyFileSync(FLAGS, BAK);
let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  if (existsSync(BAK)) {
    copyFileSync(BAK, FLAGS);
    rmSync(BAK);
  }
}
process.on('exit', restore);

try {
  const flags = JSON.parse(readFileSync(FLAGS, 'utf8'));
  Object.assign(flags, {
    ENABLE_SENIOR_INTEGRATION: true,
    ENABLE_SENIOR_PUNCH_BUTTON: false,
    ENABLE_MANUAL_PUNCH: false,
    ENABLE_META_TIMESHEET: true,
    ACTIVE_COMPANY: 'insi',
    APP_NAME: 'Ponto Insi',
    ENABLE_WIDGET: true,
    ENABLE_NOTIFICATIONS: true,
    ENABLE_YESTERDAY: false,
    THEME: 'insi',
    DEBUG: true,
    ENABLE_NETLOG_CAPTURE: true,
    ENABLE_AUTO_PUNCH: true,
  });
  writeFileSync(FLAGS, JSON.stringify(flags, null, 2) + '\n');
  console.log('🔧 build:insi:debug — DEBUG + ENABLE_NETLOG_CAPTURE + ENABLE_AUTO_PUNCH ligados (dev-only, serão restaurados)');

  execSync('wxt build', { stdio: 'inherit' });
  execSync('wxt zip', { stdio: 'inherit' });

  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const from = `.output/senior-ponto-${pkg.version}-chrome.zip`;
  const to = `.output/ponto-insi-${pkg.version}-debug.zip`;
  if (existsSync(from)) {
    renameSync(from, to);
    console.log(`✅ build de diagnóstico: ${to}`);
  } else {
    console.log(`⚠️ zip não encontrado em ${from}`);
  }
} finally {
  restore();
  console.log('↩️  build-flags.json restaurado (flags dev-only não ficam staged)');
}
