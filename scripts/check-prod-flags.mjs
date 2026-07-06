#!/usr/bin/env node
/**
 * Gate de produção: falha se build-flags.json contiver flags dev-only ativas.
 *
 * Usado por:
 *   - .github/workflows/prod-flags.yml (PRs → master)
 *   - .github/workflows/release-please.yml (job publish-chrome, antes do build)
 *   - localmente: `node scripts/check-prod-flags.mjs`
 *
 * DEBUG liga logs verbosos e o painel Spike; ENABLE_NETLOG_CAPTURE injeta
 * content scripts de captura de tráfego HTTP em <all_urls>. Nenhuma das duas
 * pode chegar a master — o zip publicado pelo release-please sai direto de lá.
 */
import fs from 'node:fs';

const FLAGS_PATH = 'lib/domain/build-flags.json';

// Flags que DEVEM ser explicitamente false em master/produção.
const DEV_ONLY_FLAGS = ['DEBUG', 'ENABLE_NETLOG_CAPTURE'];

const flags = JSON.parse(fs.readFileSync(FLAGS_PATH, 'utf8'));
const violations = DEV_ONLY_FLAGS.filter((f) => flags[f] !== false);

if (violations.length > 0) {
  console.error(`❌ ${FLAGS_PATH}: flag(s) dev-only ativa(s): ${violations.join(', ')}`);
  console.error('   Estas flags DEVEM ser false para merge em master / publicação.');
  process.exit(1);
}

console.log(`✅ ${FLAGS_PATH}: flags de produção OK (${DEV_ONLY_FLAGS.join(', ')} = false)`);
