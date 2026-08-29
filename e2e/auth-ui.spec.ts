import { test, expect } from '@playwright/test';

test('registers a user and shows home UI', async ({ page }) => {
  await page.goto('/auth');

  await page.getByTestId('tab-register').click();

  const suffix = Date.now().toString();
  const email = `e2e+${suffix}@example.com`;
  const username = `user_${suffix}`;
  const password = 'Passw0rd!e2e';

  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-register-username').fill(username);
  await page.getByTestId('input-register-password').fill(password);
  await page.getByTestId('input-confirm-password').fill(password);

  await page.locator('label[for="agree-register"]').click();

  await page.getByTestId('button-register').click();

  await page.waitForURL('**/');

  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('page-title')).toHaveText('Наша история');
  await expect(page.getByTestId('button-create-memory')).toBeVisible();
});
