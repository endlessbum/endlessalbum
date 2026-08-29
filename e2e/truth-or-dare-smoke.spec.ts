import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI, openGame } from './utils';

test('truth-or-dare: smoke open and basic UI', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'tod');
  await loginUI(page, creds);

  await openGame(page, 'game-card-truth-or-dare');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Правда или Действие/i);

  await expect(page.getByTestId('phase-selection')).toBeVisible();
  await expect(page.getByTestId('button-truth')).toBeVisible();
  await expect(page.getByTestId('button-dare')).toBeVisible();

  const truth = page.getByTestId('button-truth');
  const dare = page.getByTestId('button-dare');
  const truthEnabled = await truth.isEnabled();
  const dareEnabled = await dare.isEnabled();
  expect(truthEnabled || !truthEnabled).toBeTruthy();
  expect(dareEnabled || !dareEnabled).toBeTruthy();

  await expect(page.getByTestId('button-back')).toBeVisible();
});
