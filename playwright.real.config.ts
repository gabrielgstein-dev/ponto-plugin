/**
 * Playwright config para E2E REAIS (atinge produção).
 *
 * - Apenas GETs read-only (sem POST/PATCH/DELETE).
 * - Browser HEADED com perfil persistente em `tests/.real-profile/`
 *   (gitignored). Login manual feito uma vez fica salvo.
 * - Para rodar:  pnpm test:e2e:real
 *
 * Nunca rodar no CI. Não há credenciais no repo.
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e-real',
  // Login manual + capturas podem demorar; um único worker pra evitar
  // conflito de sessão.
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  retries: 0,
  reporter: [['list']],
  use: {
    // Cada spec controla seu próprio context via launchPersistentContext.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
