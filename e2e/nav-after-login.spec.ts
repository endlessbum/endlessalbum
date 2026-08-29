import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI } from './utils';

test('main navigation after login', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'nav');
  await loginUI(page, creds);

  const linkHome = page.getByRole('link', { name: 'Главная' });
  const linkMusic = page.getByRole('link', { name: 'Музыка' });
  const linkMessages = page.getByRole('link', { name: 'Сообщения' });
  const linkProfile = page.getByRole('link', { name: 'Профиль' });
  const linkSettings = page.getByRole('link', { name: 'Настройки' });
  const buttonCreate = page.getByRole('button', { name: 'Добавить' });

  await expect(linkHome).toBeVisible();
  await expect(linkMusic).toBeVisible();
  await expect(buttonCreate).toBeVisible();
  await expect(linkMessages).toBeVisible();
  await expect(linkProfile).toBeVisible();
  await expect(linkSettings).toBeVisible();

  await linkMusic.click();
  await expect(page.getByRole('heading', { name: 'Музыка' })).toBeVisible();

  await buttonCreate.click();
  await expect(page.getByRole('heading', { name: 'Создать воспоминание' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Создать воспоминание' })).toBeHidden();

  await linkProfile.click();
  await expect(page.getByTestId('profile-page')).toBeVisible();

  await linkSettings.click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();

  await linkMessages.click();
  await expect(page.getByTestId('chat-page')).toBeVisible();

  await linkHome.click();
  await expect(page.getByTestId('home-page')).toBeVisible();
});
