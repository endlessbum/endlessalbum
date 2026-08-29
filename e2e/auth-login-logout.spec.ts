import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('login existing user navigates to home', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'login');
  await loginUI(page, creds);
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('logout redirects to /auth', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'login');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Профиль' }).click();
  await page.waitForURL('**/profile');
  await page.getByTestId('button-logout').click();

  await page.waitForURL('**/auth');
  await expect(page.getByTestId('auth-page')).toBeVisible();
});
