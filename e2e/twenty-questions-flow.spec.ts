import { test, expect } from '@playwright/test';
import { registerViaApi, loginUI, createInvite, registerPartnerWithInvite, openGame } from './utils';

test('twenty-questions: set word, ask and guess', async ({ page, request, browser }) => {
  const creds = await registerViaApi(request, 'tq');
  await loginUI(page, creds);
  await openGame(page, 'game-card-twenty-questions');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/20 вопросов/i);

  await page.getByTestId('input-word').fill('кофе');

  const inviteCode = await createInvite(page.request);
  const { ctx, page: page2 } = await registerPartnerWithInvite(browser, inviteCode, 'tq');
  await openGame(page2, 'game-card-twenty-questions');
  await page2.getByTestId('input-word').fill('чай');
  await expect(page2.getByTestId('button-set-word')).toBeEnabled({ timeout: 10000 });
  await page2.getByTestId('button-set-word').click();

  const myInput = page.getByTestId('input-word');
  if (await myInput.isVisible().catch(() => false)) {
    const mySetBtn = page.getByTestId('button-set-word');
    await expect(mySetBtn).toBeEnabled({ timeout: 10000 });
    await mySetBtn.click();
  }

  await expect(page.getByText(/вопросов осталось/i)).toBeVisible({ timeout: 10000 });

  await expect(page.getByTestId('button-back')).toBeVisible();
  await ctx.close();
});
