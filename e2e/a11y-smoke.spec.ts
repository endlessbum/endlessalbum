import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes = [
  { path: '/auth', name: 'auth' },
  { path: '/privacy', name: 'privacy' },
  { path: '/terms', name: 'terms' },
];

for (const route of publicRoutes) {
  test(`a11y: ${route.name}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator('main,form,[role="main"]').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  console.warn(`[a11y:${route.name}] serious/critical:`, serious.length);
  });
}
