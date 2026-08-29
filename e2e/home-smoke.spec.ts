import { test, expect } from '@playwright/test';
import { registerViaApi, loginViaApi } from './utils';

test.describe('home: layout & proportions', () => {
  test('grid renders and cards keep aspect ratios', async ({ page, request }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
  const creds = await registerViaApi(request, 'home');
  await loginViaApi(page, creds);
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('page-title')).toBeVisible();

    const grid = page.getByTestId('memories-grid');
    await expect(grid).toBeVisible();

    const cards = grid.locator('.flip-card');
    const count = await cards.count();
    if (count === 0) {
      await expect(page.getByTestId('empty-state')).toBeVisible();
      return; // nothing else to validate
    }

    const wideSel = grid.locator('[class*="card-ar-"][class*="-h"]');
    const wideCount = await wideSel.count();
    if (wideCount > 0) {
      const box = await wideSel.first().boundingBox();
      if (box) {
        const ratio = box.width / box.height;
        expect(ratio).toBeGreaterThanOrEqual(1.4);
      }
    }

    try { await grid.screenshot({ path: 'test-results/home-grid.png' }); } catch {}
  });
});
