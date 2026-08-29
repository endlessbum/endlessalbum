import { test, expect, devices } from '@playwright/test';
import { registerViaApi, loginViaApi } from './utils';

const mobileViewport = { width: 390, height: 844 };

test.use({ viewport: mobileViewport, userAgent: devices['iPhone 13'].userAgent });

test.describe('home (mobile): no horizontal scroll and usable UI', () => {
  test('mobile layout is responsive', async ({ page, request }) => {
    test.setTimeout(60_000);

    const creds = await registerViaApi(request, 'home-mobile');
    await loginViaApi(page, creds);

    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 20000 });

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBeFalsy();

  await expect(page.getByTestId('search-input-mobile')).toBeVisible();
  await expect(page.getByTestId('search-input-desktop')).toBeHidden();

    const grid = page.getByTestId('memories-grid');
    await expect(grid).toBeVisible();
    const gridOverflowing = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="memories-grid"]') as HTMLElement | null;
      if (!el) return false;
      return el.scrollWidth > el.clientWidth + 1; // tolerate sub-pixel
    });
    expect(gridOverflowing).toBeFalsy();

    const cards = grid.locator('.flip-card');
    const count = await cards.count();
    if (count === 0) {
      await expect(page.getByTestId('empty-state')).toBeVisible();
    } else {
      await expect(cards.first()).toBeVisible();
    }
  });
});
