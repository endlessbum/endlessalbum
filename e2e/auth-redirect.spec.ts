import { test, expect } from '@playwright/test';

test('redirects unauthenticated / -> /auth and shows legal links', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/auth');
  const privacy = page.getByTestId('link-privacy');
  const terms = page.getByTestId('link-terms');
  await expect(privacy).toBeVisible();
  await expect(terms).toBeVisible();
});
