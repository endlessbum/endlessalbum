import { test, expect } from '@playwright/test';
test.setTimeout(60000);
import { registerViaApi, loginUI } from './utils';

test('open each game and return back', async ({ page, request }) => {
  const creds = await registerViaApi(request, 'gamesall');
  await loginUI(page, creds);

  await page.getByRole('link', { name: 'Игры' }).click();
  await page.waitForURL('**/games');
  await expect(page.getByTestId('games-page')).toBeVisible();
  const grid = page.getByTestId('games-grid');
  await expect(grid).toBeVisible();

  const gameIds = ['truth-or-dare', 'twenty-questions', 'role-playing', 'partner-quiz'];
  for (const id of gameIds) {
    const card = grid.getByTestId(`game-card-${id}`);
    await expect(card).toBeVisible();
    await card.click();

    const backBtn = page.getByTestId('button-back');
    await expect(backBtn).toBeVisible({ timeout: 10000 });

    const expectedTitles: Record<string, RegExp> = {
      'truth-or-dare': /Правда или Действие/i,
      'twenty-questions': /20 вопросов/i,
      'role-playing': /Ролевая|сценарии|Роли/i,
      'partner-quiz': /Викторина|викторина|Партнер/i,
    };
    const titleRe = expectedTitles[id];
    if (titleRe) {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(titleRe);
    }

    await backBtn.click();
    await expect(page.getByTestId('games-grid')).toBeVisible();
  }
});
