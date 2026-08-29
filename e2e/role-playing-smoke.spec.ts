import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI, openGame } from './utils';

test('role-playing: smoke select scenario and see role assignment', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'rp');
  await loginUI(page, creds);

  await openGame(page, 'game-card-role-playing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Ролевая игра/i);

  await expect(page.getByTestId('phase-selection')).toBeVisible();
  const scenarioCard = page.getByTestId(/^scenario-/).first();
  await scenarioCard.click();

  await expect(page.getByTestId('phase-role-assignment')).toBeVisible();
  await expect(page.getByTestId('button-start-roleplay')).toBeVisible();
});
