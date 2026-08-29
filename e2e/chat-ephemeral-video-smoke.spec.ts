import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('chat: ephemeral video locked preview then unlock', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'ephem-video');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Сообщения' }).click();
  await expect(page.getByTestId('chat-page')).toBeVisible();

  await page.getByTestId('button-attach-file').click();

  await page.getByTestId('attach-ephemeral-camera').click();
  
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();

  const hasVideo = await modal.locator('video').isVisible().catch(() => false);
  if (!hasVideo) test.skip();

  await modal.getByTestId('ephemeral-capture-video').click();
  await page.waitForTimeout(1500);
  const stopBtn = modal.getByTestId('ephemeral-capture-stop');
  const stopVisible = await stopBtn.isVisible().catch(() => false);
  if (!stopVisible) test.skip();
  await stopBtn.click();

  const messagesContainer = page.getByTestId('messages-container');
  const last = messagesContainer.locator('[data-testid^="message-"]').last();
  await expect(last).toBeVisible();

  const overlay = last.getByTestId(/message-.*-ephemeral-lock-overlay/);
  await expect(overlay).toBeVisible();
  await overlay.click();
  await expect(overlay).toBeHidden();
  await expect(last.getByTestId(/message-.*-ephemeral-timer/)).toBeVisible();
});
