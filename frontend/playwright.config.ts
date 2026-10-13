import { defineConfig } from '@playwright/test';
export function e2eBaseURL(value = process.env.HANBIT_E2E_BASE_URL ?? 'http://localhost:8088') {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('E2E target must be a loopback HTTP origin');
  return url.origin;
}
export function e2eComposeProject(
  value = process.env.HANBIT_E2E_COMPOSE_PROJECT ?? 'hanbit-account-e2e',
) {
  if (!/^hanbit-[a-z0-9-]*e2e$/.test(value) || /(?:^|-)prod(?:-|$)/.test(value))
    throw new Error('E2E requires an explicit isolated hanbit test project');
  return value;
}
e2eComposeProject();
export default defineConfig({
  testDir: './e2e',
  timeout: 180000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Failure DOM context can contain synthetic private results; retain no test artifacts.
  preserveOutput: 'never',
  reporter: 'list',
  use: {
    baseURL: e2eBaseURL(),
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 15000,
    navigationTimeout: 15000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
