import { Page, APIRequestContext, Browser, expect } from '@playwright/test';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForHealth(request: APIRequestContext, timeoutMs = 5000) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request.get('/api/health');
      if (res.ok()) return true;
    } catch {}
    attempt++;
    await sleep(Math.min(1000, 100 * Math.pow(2, attempt))); // 100ms -> 800ms
  }
  return false;
}

export async function registerViaApi(request: APIRequestContext, prefix: string) {
  await waitForHealth(request).catch(() => {});

  const suffix = Date.now().toString();
  const email = `e2e+${prefix}+${suffix}@example.com`;
  const username = `${prefix}_${suffix}`;
  const password = 'Passw0rd!e2e';

  let lastErr: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await request.post('/api/register', { data: { email, username, password } });
      if (res.ok()) {
        return { email, username, password };
      }
      lastErr = new Error(`register failed: ${res.status()} ${res.statusText()}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(150 * Math.pow(2, attempt - 1));
  }
  throw lastErr || new Error('registerViaApi: unknown error');
}

export async function loginUI(page: Page, creds: { username: string; password: string }) {
  let ok = false;
  for (let i = 0; i < 3 && !ok; i++) {
    try {
      await page.goto('/auth', { waitUntil: 'load' });
      ok = true;
    } catch {
      await sleep(300 * (i + 1));
    }
  }
  await page.getByTestId('tab-login').click();
  await page.getByTestId('input-username').fill(creds.username);
  await page.getByTestId('input-password').fill(creds.password);
  await page.getByTestId('button-login').click();
  await page.waitForURL('**/');
}

export async function loginViaApi(page: Page, creds: { username: string; password: string }) {
  const res = await page.request.post('/api/login', { data: { username: creds.username, password: creds.password } });
  expect(res.ok()).toBeTruthy();
  await page.goto('/');
  await page.waitForURL('**/');
}

export async function createInvite(request: APIRequestContext) {
  const inviteRes = await request.post('/api/couple/invite');
  expect(inviteRes.ok()).toBeTruthy();
  const { inviteCode } = await inviteRes.json();
  return inviteCode as string;
}

export async function registerPartnerWithInvite(browser: Browser, inviteCode: string, prefix: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const suffix = Date.now().toString();
  const email = `e2e+${prefix}+partner+${suffix}@example.com`;
  const username = `${prefix}_partner_${suffix}`;
  const password = 'Passw0rd!e2e';
  const reg = await page.request.post('/api/register-with-invite', { data: { email, username, password, inviteCode } });
  expect(reg.ok()).toBeTruthy();
  await page.goto('/');
  await page.waitForURL('**/');
  return { ctx, page };
}

export async function openGame(page: Page, gameTestId: string) {
  await page.getByRole('link', { name: 'Игры' }).click();
  await page.waitForURL('**/games');
  await expect(page.getByTestId('games-page')).toBeVisible();
  await page.getByTestId('games-grid').getByTestId(gameTestId).click();
  await expect(page.getByTestId('button-back')).toBeVisible();
}

export async function fillByType(input: ReturnType<Page['getByTestId']>, value: string) {
  const typeAttr = await input.getAttribute('type');
  if (typeAttr === 'number') {
    await input.fill(/\d+/.test(value) ? value : '5');
  } else {
    await input.fill(value);
  }
}
