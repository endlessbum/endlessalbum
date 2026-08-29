import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('profile: update username and email persist after reload', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'profile_user_update');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Профиль' }).click();
  await page.waitForURL('**/profile');
  await expect(page.getByTestId('profile-page')).toBeVisible();

  const suffix = Date.now();
  const newUsername = `updated_${suffix}`;
  const newEmail = `updated+${suffix}@example.com`;

  await page.getByTestId('input-username').fill(newUsername);
  await page.waitForTimeout(100);
  await page.getByTestId('input-email').fill(newEmail);
  await page.waitForTimeout(200);

  await expect(page.getByTestId('button-save-profile')).toBeEnabled({ timeout: 5000 });
  
  await page.getByTestId('button-save-profile').click();

  await expect(page.getByTestId('button-save-profile')).toBeEnabled({ timeout: 10000 });

  await page.reload();
  await expect(page.getByTestId('profile-page')).toBeVisible();
  await expect(page.getByTestId('input-username')).toHaveValue(newUsername);
  await expect(page.getByTestId('input-email')).toHaveValue(newEmail);
});
