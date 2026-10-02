// The customer walkthrough (Sprint 26): a real customer's journey on a trial-like
// stack, screenshotted step by step on a phone and a laptop. Not a test suite —
// it records what the owner would see. See walkthrough/README.md.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /customer\.walk\.ts/,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: 'list',
  use: { locale: 'en-IN', timezoneId: 'Asia/Kolkata', actionTimeout: 10_000, navigationTimeout: 30_000 },
});
