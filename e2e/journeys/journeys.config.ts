// Records the R2 rehearsal journeys (not a test suite; see journeys/README.md)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /record\.spec\.ts/,
  globalSetup: '../support/global-setup.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { locale: 'en-IN', timezoneId: 'Asia/Kolkata', actionTimeout: 15_000, navigationTimeout: 30_000 },
});
