// Browser tests of the Dawabag website. They need the API (scripts/dev-up.sh) and the
// website (next start on WEB_URL) running against the same database and Redis.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  globalTeardown: './support/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.WEB_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /(public|a11y|partnerStock|partnerOnboarding|partnerDrafts)\.spec\.ts/ },
  ],
});
