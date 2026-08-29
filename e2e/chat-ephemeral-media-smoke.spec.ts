import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('chat: ephemeral photo locked preview then unlock', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'ephem-media');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Сообщения' }).click();
  await expect(page.getByTestId('chat-page')).toBeVisible();

  await page.getByTestId('button-attach-file').click();

  await page.getByTestId('attach-ephemeral-camera').click();
  
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  const hasVideo = await modal.locator('video').isVisible().catch(() => false);
  if (!hasVideo) test.skip();
  await modal.getByTestId('ephemeral-capture-photo').click();

  const media = page.getByTestId(/message-.*-ephemeral-media/).first();
  await expect(media).toBeVisible();
  const overlay = media.getByTestId(/ephemeral-lock-overlay$/);
  await expect(overlay).toBeVisible();

  await overlay.click();
  await expect(overlay).toBeHidden();
  await expect(media.getByTestId(/ephemeral-timer$/)).toBeVisible();
});
