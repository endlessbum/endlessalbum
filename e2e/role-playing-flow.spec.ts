import { test, expect } from '@playwright/test';

async function login(page: any, request: any) {
  const suffix = Date.now().toString();
  const email = `e2e+roleplay+${suffix}@example.com`;
  const username = `roleplay_${suffix}`;
  const password = 'Passw0rd!e2e';
  const res = await request.post('/api/register', { data: { email, username, password } });
  expect(res.ok()).toBeTruthy();
  await page.goto('/auth');
  await page.getByTestId('tab-login').click();
  await page.getByTestId('input-username').fill(username);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('button-login').click();
  await page.waitForURL('**/');
}

test('role-playing: select scenario, start, send message', async ({ page, request }) => {
  await login(page, request);

  await page.getByRole('link', { name: 'Игры' }).click();
  await page.waitForURL('**/games');
  await expect(page.getByTestId('games-page')).toBeVisible();

  await page.getByTestId('games-grid').getByTestId('game-card-role-playing').click();
  await expect(page.getByTestId('button-back')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Ролевая/i);

  const firstScenario = page.getByTestId('scenario-1');
  await expect(firstScenario).toBeVisible();
  await firstScenario.click();

  const startBtn = page.getByTestId('button-start-roleplay');
  await expect(startBtn).toBeVisible();
  await startBtn.click();

  await page.getByTestId('input-message').fill('Привет! Погнали по сценарию.');
  await page.getByTestId('button-send-message').click();

  await page.getByTestId('button-new-prompt').click();

  await expect(page.getByTestId('button-back')).toBeVisible();
});
