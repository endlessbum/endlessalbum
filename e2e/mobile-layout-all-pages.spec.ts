import { test, expect, devices, type Page } from '@playwright/test';
import { registerViaApi, loginViaApi } from './utils';

const mobileViewport = { width: 390, height: 844 };
test.use({ viewport: mobileViewport, userAgent: devices['iPhone 13'].userAgent });

async function expectNoHorizontalScroll(page: Page) {
  const has = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(has, 'Unexpected horizontal overflow').toBeFalsy();
}

test.describe('mobile grid layout', () => {
  test('home page grid has no horizontal overflow', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'mobile-grid');
    await loginViaApi(page, creds);
    await page.goto('/');
    await expectNoHorizontalScroll(page);
  });

  test('music page grid has no horizontal overflow', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'mobile-music');
    await loginViaApi(page, creds);
    await page.goto('/');
    await page.getByRole('link', { name: 'Музыка' }).click();
    await expect(page.getByRole('heading', { name: /Музыка/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('settings page grid has no horizontal overflow', async ({ page, request }) => {
    const creds = await registerViaApi(request, 'mobile-settings');
    await loginViaApi(page, creds);
    await page.goto('/');
    await page.getByRole('link', { name: 'Настройки' }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
