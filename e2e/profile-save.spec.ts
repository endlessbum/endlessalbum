import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('profile: save first/last name and status persists after reload', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'profile_save');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Профиль' }).click();
  await page.waitForURL('**/profile');
  await expect(page.getByTestId('profile-page')).toBeVisible();

  const first = 'Иван';
  const last = 'Иванов';
  const status = 'Люблю тесты E2E';

  await page.getByTestId('input-first-name').fill(first);
  await page.waitForTimeout(100);
  await page.getByTestId('input-last-name').fill(last);
  await page.waitForTimeout(100);
  await page.getByTestId('input-status').fill(status);
  await page.waitForTimeout(200);

  await expect(page.getByTestId('button-save-profile')).toBeEnabled({ timeout: 5000 });

  await page.getByTestId('button-save-profile').click();

  await expect(page.getByTestId('button-save-profile')).toBeEnabled({ timeout: 10000 });

  await page.reload();
  await expect(page.getByTestId('profile-page')).toBeVisible();

  await expect(page.getByTestId('input-first-name')).toHaveValue(first);
  await expect(page.getByTestId('input-last-name')).toHaveValue(last);
  await expect(page.getByTestId('input-status')).toHaveValue(status);

  await page.getByRole('link', { name: 'Музыка' }).click();
  await page.getByRole('link', { name: 'Профиль' }).click();
  await expect(page.getByTestId('input-first-name')).toHaveValue(first);
  await expect(page.getByTestId('input-last-name')).toHaveValue(last);
  await expect(page.getByTestId('input-status')).toHaveValue(status);
});
