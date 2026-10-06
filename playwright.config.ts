import { defineConfig, devices } from '@playwright/test';

/** E2E against `astro dev` with the in-memory store: nothing is committed anywhere. */
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:4329', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm astro dev --port 4329',
    url: 'http://localhost:4329/admin/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VERCEL: '1', ADMIN_STORE: 'memory', SESSION_SECRET: 'e2e-only-session-secret-e2e-only-0000' },
  },
});
