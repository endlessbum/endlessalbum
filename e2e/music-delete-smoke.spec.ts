import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

async function ensureHasRow(page: any) {
  const list = page.getByTestId('music-list');
  const exists = await list.isVisible().catch(() => false);
  return exists;
}

test('music: delete smoke', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'mdel');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Музыка' }).click();
  await expect(page.getByRole('heading', { name: 'Музыка' })).toBeVisible();

  const hasList = await ensureHasRow(page);
  if (!hasList) test.skip(true, 'Нет треков для удаления');

  const firstRow = page.getByTestId(/^music-row-/).first();
  const titleBefore = await firstRow.textContent();

  await firstRow.getByRole('button', { name: 'Дополнительно' }).click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();

  await expect(firstRow).not.toHaveText(titleBefore || '', { timeout: 10000 });
});
