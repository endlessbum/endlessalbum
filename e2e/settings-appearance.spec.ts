import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

async function loginNewUser(page: any, request: any) {
  const creds = await registerViaApi(request, 'settings');
  await loginUI(page, creds);
}

test('toggle dark mode and change font (no save)', async ({ page, request }) => {
  await loginNewUser(page, request);

  await page.getByRole('link', { name: 'Настройки' }).click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();

  await page.getByTestId('tab-appearance').click();

  const htmlEl = page.locator('html');
  const wasDark = await htmlEl.evaluate((el) => el.classList.contains('dark'));
  await page.getByTestId('switch-dark-mode').click();
  await expect(htmlEl).toHaveClass(new RegExp(wasDark ? '\\blight\\b' : '\\bdark\\b'));

  await page.getByTestId('select-font').click();
  const firstOption = page.locator('[role="listbox"] [role="option"]').first();
  await firstOption.click();

  await expect(page.getByTestId('settings-page')).toBeVisible();
});
