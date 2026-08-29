import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

async function ensureRow(page: any) {
  const row = page.getByTestId(/^music-row-/).first();
  const has = await row.isVisible().catch(() => false);
  return has ? row : null;
}

test('music: edit metadata smoke', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'medit');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Музыка' }).click();
  await expect(page.getByRole('heading', { name: 'Музыка' })).toBeVisible();

  const row = await ensureRow(page);
  if (!row) test.skip(true, 'Нет треков для редактирования');

  await row!.getByRole('button', { name: 'Дополнительно' }).click();
  await page.getByRole('menuitem', { name: 'Изменить' }).click();

  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  const t = dlg.locator('#edit-title');
  const a = dlg.locator('#edit-artist');
  const stamp = `E2E_${Date.now().toString().slice(-4)}`;
  await t.fill(stamp);
  await a.fill('Тестовый исполнитель');
  await dlg.getByRole('button', { name: 'Сохранить' }).click();

  await expect(row!.getByText(stamp, { exact: false })).toBeVisible();
});
