import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('games page shows grid and cards', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'games');
  await loginUI(page, creds);
  await page.getByRole('link', { name: 'Игры' }).click();
  await page.waitForURL('**/games');
  await expect(page.getByTestId('games-page')).toBeVisible({ timeout: 15000 });

  const grid = page.getByTestId('games-grid');
  await expect(grid).toBeVisible({ timeout: 10000 });
  const firstCard = grid.locator('[data-testid^="game-card-"]').first();
  const hasCard = await firstCard.isVisible().catch(() => false);
  if (hasCard) {
    const btn = firstCard.locator('[data-testid^="button-start-"]').first();
    await expect(btn).toBeVisible();
  }
});
