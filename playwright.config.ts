import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'ui.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results',
  globalSetup: './tests/ui-setup.mjs',
  use: {
    baseURL: 'http://127.0.0.1:3002',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    locale: 'fr-FR',
    timezoneId: 'Africa/Casablanca',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
