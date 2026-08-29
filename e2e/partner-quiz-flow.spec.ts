import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI, createInvite, registerPartnerWithInvite, openGame, fillByType } from './utils';

async function login(page: any, request: any) {
  const creds = await registerViaApi(request, 'pq');
  await loginUI(page, creds);
}

test('partner-quiz: start round and answer', async ({ page, request, browser }) => {
  await login(page, request);
  await openGame(page, 'game-card-partner-quiz');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Викторина|Партнер/i);

  const inviteCode = await createInvite(page.request);
  const { ctx, page: page2 } = await registerPartnerWithInvite(browser, inviteCode, 'pq');
  await openGame(page2, 'game-card-partner-quiz');

  const startBtn = page.getByTestId('button-start-quiz');
  await expect(startBtn).toBeEnabled({ timeout: 10000 });
  await startBtn.click();

  const textInput = page.getByTestId('input-answer');
  if (await textInput.isVisible().catch(() => false)) {
    await fillByType(textInput, 'тестовый ответ');
  } else {
    const optionBtn = page.getByTestId('option-0');
    if (await optionBtn.isVisible().catch(() => false)) {
      await optionBtn.click();
    }
  }

  const submit = page.getByTestId('button-submit-answer');
  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
  }

  await expect(page.getByTestId('button-back')).toBeVisible();
  await ctx.close();
});
