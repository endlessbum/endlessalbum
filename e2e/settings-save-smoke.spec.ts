import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('settings: save chat background and font', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'sett');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Настройки' }).click();
  await expect(page.getByTestId('settings-page')).toBeVisible();

  await page.getByTestId('tab-messages').click();

  const bgSelect = page.getByTestId('select-chat-background');
  await bgSelect.click();
  await page.waitForTimeout(100);
  await page.getByRole('option', { name: 'Голубой' }).click();
  await page.waitForTimeout(200);

  await page.getByTestId('tab-appearance').click();

  const fontSelect = page.getByTestId('select-font');
  await fontSelect.click();
  await page.getByRole('option', { name: 'Pitagon Sans Mono Bold' }).click();

  const saveBtn = page.getByTestId('button-save-settings');
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  const ls = await page.evaluate(() => ({
    chatBg: localStorage.getItem('ui:chatBackground'),
    font: localStorage.getItem('ui:font'),
  }));
  expect(ls.chatBg).toBe('blue');
  expect(ls.font).toBe('PitagonSansMono-Bold');

  const cssFamily = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-sans'));
  expect(cssFamily).toContain('Pitagon Sans Mono Bold');
});
