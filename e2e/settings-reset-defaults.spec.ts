import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('settings: reset to defaults restores original UI font', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'setres');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Настройки' }).click();
  await page.getByTestId('tab-appearance').click();

  const initialCss = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-sans'));
  const initialIsLight = initialCss.includes('Pitagon Sans Mono Light');
  const targetLabel = initialIsLight ? 'Pitagon Sans Mono Bold' : 'Pitagon Sans Mono Light';

  await page.getByTestId('select-font').click();
  await page.getByRole('option', { name: targetLabel }).click();

  const resetBtn = page.getByTestId('button-reset-settings');
  await expect(resetBtn).toBeVisible();

  await resetBtn.click();
  const revertedCss = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-sans'));
  expect(revertedCss).toContain(initialIsLight ? 'Pitagon Sans Mono Light' : 'Pitagon Sans Mono Bold');
});
