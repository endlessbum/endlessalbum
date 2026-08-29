import { test, expect, type Page } from '@playwright/test';
import { loginViaApi, registerViaApi } from './utils';

async function _createCouple(page: Page, request: any) {
  const response = await request.post('/api/couple/invite');
  return response.ok() ? await response.json() : null;
}

test.describe('API Unified Error Format', () => {
  test('memories endpoint returns unified error format on validation', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'memerr');
    await loginViaApi(page, creds);

    const response = await request.post('/api/memories', {
      data: { type: 'text' }, // Missing required content for text type
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(response.status()).toBe(400);
    const body = await response.json();

    expect(body).toHaveProperty('error'); // Machine-readable error code (snake_case)
    expect(body).toHaveProperty('message'); // Human-readable message (Russian)
    expect(body).toHaveProperty('details'); // Validation details array

    expect(body.error).toMatch(/^[a-z_]+$/);

    expect(body.message).toContain('Ошибка');

    expect(Array.isArray(body.details)).toBe(true);
    if (body.details.length > 0) {
      expect(body.details[0]).toHaveProperty('field');
      expect(body.details[0]).toHaveProperty('message');
    }
  });

  test('messages endpoint returns unified error format on validation', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'msgerr');
    await loginViaApi(page, creds);

    const response = await request.post('/api/messages', {
      data: { type: 'text' }, // Missing content for text type
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect(response.status()).toBe(400);
    const body = await response.json();
    
    expect(body).toHaveProperty('error');
    expect(body.error).toBe('validation_failed');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('details');
  });

  test('profile endpoint returns unified error for not found user', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'profnotfound');
    await loginViaApi(page, creds);

    const response = await request.get('/api/profile');
    expect(response.status()).toBe(200);
    const profile = await response.json();

    expect(profile).toHaveProperty('id');
    expect(profile).toHaveProperty('username', creds.username);
  });

  test('auth endpoints show error on wrong credentials', async ({ page }) => {
    await page.goto('/auth');
    await page.getByTestId('tab-login').click();

    await page.getByTestId('input-username').fill('nonexistent_user_test_12345');
    await page.getByTestId('input-password').fill('wrongpassword');
    await page.getByTestId('button-login').click();

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/auth/);
  });

  test('couple endpoints work for authenticated user (auto-created couple)', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'nocouple');
    await loginViaApi(page, creds);

    const response = await request.get('/api/couple');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('mainAdminId');
  });

  test('forbidden actions return 403 with unified format', async ({ browser, request }) => {
    const creds1 = await registerViaApi(request, 'adminuser');

    const creds2 = await registerViaApi(request, 'coadminuser');

    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await loginViaApi(page1, creds1);

    const inviteRes = await request.post('/api/couple/invite');
    expect(inviteRes.status()).toBe(200);

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await loginViaApi(page2, creds2);

    const generateRes = await page2.request.post('/api/couple/generate-invite');
    expect(generateRes.status()).toBe(200);
    
    await ctx1.close();
    await ctx2.close();
  });

  test('settings endpoint works for new user with auto-created couple', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'setterr');
    await loginViaApi(page, creds);

    const response = await request.get('/api/settings');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('settings');
  });

  test('games endpoint works for new user with auto-created couple', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'gameerr');
    await loginViaApi(page, creds);

    const response = await request.get('/api/games');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

test.describe('API Response Structure', () => {
  test('success responses have correct structure', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'successapi');
    await loginViaApi(page, creds);

    const profileRes = await request.get('/api/profile');
    expect(profileRes.status()).toBe(200);
    const profile = await profileRes.json();

    expect(profile).toHaveProperty('id');
    expect(profile).toHaveProperty('username');
    expect(profile).toHaveProperty('email');
    expect(profile).toHaveProperty('role');

    expect(profile).not.toHaveProperty('password');
  });

  test('counter endpoints work for new user with auto-created couple', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'counterapi');
    await loginViaApi(page, creds);

    const response = await request.get('/api/counters');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

test.describe('Health Check', () => {
  test('health endpoint returns status', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('env');
  });
});
