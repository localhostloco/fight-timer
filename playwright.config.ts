import { defineConfig, devices } from '@playwright/test';

const base = process.env.BASE_PATH ?? '/fight-timer/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:4173${base}`,
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'node scripts/serve-pages.mjs',
    url: `http://localhost:4173${base}`,
    reuseExistingServer: !process.env.CI,
  },
});
