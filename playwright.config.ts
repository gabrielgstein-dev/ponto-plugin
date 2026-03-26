import { defineConfig } from '@playwright/test'
import path from 'path'

const EXTENSION_PATH = path.resolve(__dirname, '.output/chrome-mv3')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome-extension',
      testMatch: '**/*.spec.ts',
      use: {
        // Extensions require a persistent context — each spec creates its own
        // via the launchExtension() helper in tests/e2e/helpers/extension.ts
        browserName: 'chromium',
      },
    },
  ],
  // Metadata available to tests via process.env
  globalSetup: undefined,
  outputDir: 'test-results',
})

export { EXTENSION_PATH }
