import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerViaApi, loginUI } from './utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGE_PATH = path.resolve(__dirname, '../client/src/assets/logo.png');

test('avatar: upload via profile page', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'avatar');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Профиль' }).click();
  await expect(page.getByTestId('profile-page')).toBeVisible();

  await page.getByTestId('button-upload-avatar').click();
  const fileInput = page.getByTestId('input-avatar-file');
  await fileInput.setInputFiles(IMAGE_PATH);

  const avatarImg = page.locator('img[alt="Avatar"]');
  await expect(avatarImg).toBeVisible({ timeout: 10_000 });
});
