import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup/chrome-mock.ts', './tests/setup/jest-dom.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['lib/presentation/**/*.{ts,tsx}'],
      exclude: ['lib/**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        'lib/presentation/**/*.{ts,tsx}': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
  resolve: {
    alias: {
      '#company': resolve(__dirname, 'lib/infrastructure/meta'),
    },
  },
})
