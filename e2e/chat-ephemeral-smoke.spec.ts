import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('chat: send ephemeral text message', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'ephem');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Сообщения' }).click();
  await expect(page.getByTestId('chat-page')).toBeVisible();

  const ephemeralModeBtn = page.getByTestId('button-ephemeral-mode');
  await expect(ephemeralModeBtn).toBeVisible();
  await ephemeralModeBtn.click();

  await expect(page.getByTestId('input-message')).toHaveAttribute(
    'placeholder',
    /исчезнет через 2 мин/i,
    { timeout: 5000 }
  );

  const input = page.getByTestId('input-message');
  await input.fill('Эфемерный привет');
  await page.getByTestId('button-send-message').click();

  await page.waitForTimeout(500);

  const messagesContainer = page.getByTestId('messages-container');
  await expect(messagesContainer).toBeVisible();

  const lastMessage = page.locator('[data-testid^="message-"]').last();
  await expect(lastMessage).toBeVisible({ timeout: 10000 });
  await expect(lastMessage).toContainText('Эфемерный привет');
});
