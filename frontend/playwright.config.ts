import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 180000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8088',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 15000,
    navigationTimeout: 15000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
