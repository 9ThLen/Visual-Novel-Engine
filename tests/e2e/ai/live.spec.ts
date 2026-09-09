import { expect, test } from '@playwright/test';

test('one read-only Ukrainian provider smoke', async ({ page }) => {
  await page.goto('/document-editor?storyId=demo-story-001&sceneId=scene_1');
  await page.getByText('AI', { exact: true }).click();
  await expect(page.getByText(/Connected ·|Підключено ·/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/).fill(
    'Відповідай одним коротким реченням українською: чи ти готовий допомогти з цією сценою? Нічого не змінюй і не створюй зображень.',
  );
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();
  await expect(page.getByRole('button', { name: /Send|Надіслати/ })).toBeEnabled({ timeout: 60_000 });
  const provider = process.env.AI_E2E_PROVIDER;
  console.log(JSON.stringify({ provider, result: 'passed', recordedAt: new Date().toISOString() }));
});
