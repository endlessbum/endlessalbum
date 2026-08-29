import { test, expect } from '@playwright/test';

const healthEndpoint = '/api/health';
const versionEndpoint = '/api/version';

test('health returns ok', async ({ request }) => {
  const res = await request.get(healthEndpoint);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('ok');
});

test('version exposes name and semver', async ({ request }) => {
  const res = await request.get(versionEndpoint);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.name).toBeTruthy();
  expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
});
