import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerViaApi, loginUI } from './utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FALLBACK_URL = '/uploads/audios/audio_1758373369802_3f1972e00e7aaddd89ef47faa4b7be8a.mp3';

async function ensureOneTrack(page: any) {
  const rows = page.getByTestId(/^music-row-/);
  const count = await rows.count().catch(() => 0);
  if (count > 0) {
    await rows.first().getByRole('button', { name: /Воспроизвести|Пауза/ }).click();
    return true;
  }
  return false;
}

test('music: hotkeys smoke', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'music');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Музыка' }).click();
  await expect(page.getByRole('heading', { name: 'Музыка' })).toBeVisible();

  const hadTrack = await ensureOneTrack(page);
  if (!hadTrack) {
    await page.goto(FALLBACK_URL);
    await page.goBack();
  }

  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyN');
  await page.keyboard.press('KeyP');

  await expect(page.getByRole('heading', { name: 'Музыка' })).toBeVisible();
});
