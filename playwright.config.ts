import { defineConfig } from '@playwright/test';

const E2E_BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5000';

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx tsx server/index.ts',
    port: Number(new URL(E2E_BASE).port || 5000),
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: '',
      RATE_LIMIT_DISABLED: '1',
      PORT: String(Number(new URL(E2E_BASE).port || 5000)),
    },
  },
});
