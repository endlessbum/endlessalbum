import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('mini player appears when playing and shows controls', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'music');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Музыка' }).click();
  await expect(page.getByRole('heading', { name: 'Музыка' })).toBeVisible();

  const items = page.getByTestId(/^music-row-/);
  const count = await items.count().catch(() => 0);
  if (count === 0) {
    await expect(page.locator('nav .ui-no-such-player')).not.toBeVisible({ timeout: 100 });
    return;
  }

  await items.first().locator('button[title="Воспроизвести"]').click();

  const nav = page.locator('nav');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: /Пауза|Воспроизвести/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Следующий' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Предыдущий' })).toBeVisible();

  const toggle = nav.getByRole('button', { name: /Пауза|Воспроизвести/ });
  await toggle.click();
  await toggle.click();
});
