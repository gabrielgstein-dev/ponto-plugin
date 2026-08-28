#!/usr/bin/env node
/**
 * Build GENÉRICO de captura de tráfego (netcap).
 *
 * Objetivo: instalar um plugin sem nenhuma amarra com o Senior/Meta e navegar
 * num app novo (ex.: outro sistema de ponto) só pra colher os requests dele
 * antes de escrever qualquer integração.
 *
 * Diferenças pro `build:insi:debug`:
 *   - ENABLE_SENIOR_INTEGRATION=false + ENABLE_META_TIMESHEET=false +
 *     ENABLE_MANUAL_PUNCH=true: nenhuma integração ativa (sem listeners de
 *     webRequest em platform.senior/api.insi, sem sync, sem abrir aba SSO). O
 *     ponto vira registro manual local, que vem de lib/infrastructure/manual/*
 *     direto — não passa pelo alias `#company`.
 *   - ACTIVE_COMPANY continua 'insi' de propósito: é só o alias `#company` que
 *     o bundler precisa resolver em tempo de build. `manual` NÃO tem
 *     `providers.ts` (o `build:manual` do package.json está quebrado hoje), e
 *     com as flags acima off nada desse módulo roda.
 *   - ENABLE_AUTO_PUNCH=false: build de leitura, não escreve ponto em lugar
 *     nenhum (e a flag exige ENABLE_SENIOR_INTEGRATION, que aqui está off).
 *
 * O que fica ligado:
 *   - ENABLE_NETLOG_CAPTURE: netcap.content (MAIN) + netcap-forward.content
 *     (ISOLATED) casam em <all_urls> e capturam TODO fetch/XHR de QUALQUER
 *     site — URL, método, headers e body de request E response.
 *   - DEBUG: faz o botão "Exportar tráfego" aparecer nas Settings
 *     (SettingsPanel só mostra MetaNetLogActions quando DEBUG && NETLOG).
 *
 * Limite conhecido: o buffer é um ring de 200 entries (lib/domain/meta-net-log.ts,
 * MAX_ENTRIES), body truncado em 32KB. Exporte antes de estourar isso — as
 * entries mais antigas caem fora silenciosamente.
 *
 * DEBUG e ENABLE_NETLOG_CAPTURE são dev-only: scripts/check-prod-flags.mjs
 * (workflow prod-flags.yml em PRs → master) barra elas ligadas. Por isso este
 * script SEMPRE restaura lib/domain/build-flags.json ao estado original ao fim
 * — inclusive se o build falhar.
 *
 * Uso:   pnpm build:generico:netcap
 * Saída: .output/ponto-generico-<versão>-netcap.zip
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync, rmSync } from 'fs';
import { execSync } from 'child_process';

const FLAGS = 'lib/domain/build-flags.json';
const BAK = 'lib/domain/build-flags.json.netcapbak';

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
    ACTIVE_COMPANY: 'insi',
    APP_NAME: 'Ponto Generico',
    ENABLE_SENIOR_INTEGRATION: false,
    ENABLE_SENIOR_PUNCH_BUTTON: false,
    ENABLE_MANUAL_PUNCH: true,
    ENABLE_META_TIMESHEET: false,
    ENABLE_WIDGET: true,
    ENABLE_NOTIFICATIONS: true,
    ENABLE_YESTERDAY: false,
    ENABLE_AUTO_PUNCH: false,
    THEME: 'dark',
    DEBUG: true,
    ENABLE_NETLOG_CAPTURE: true,
  });
  writeFileSync(FLAGS, JSON.stringify(flags, null, 2) + '\n');
  console.log('🔧 build:generico:netcap — modo manual + DEBUG + ENABLE_NETLOG_CAPTURE (dev-only, serão restaurados)');

  execSync('wxt build', { stdio: 'inherit' });
  execSync('wxt zip', { stdio: 'inherit' });

  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const from = `.output/senior-ponto-${pkg.version}-chrome.zip`;
  const to = `.output/ponto-generico-${pkg.version}-netcap.zip`;
  if (existsSync(from)) {
    renameSync(from, to);
    console.log(`✅ build de captura: ${to}`);
  } else {
    console.log(`⚠️ zip não encontrado em ${from}`);
  }
} finally {
  restore();
  console.log('↩️  build-flags.json restaurado (flags dev-only não ficam staged)');
}
