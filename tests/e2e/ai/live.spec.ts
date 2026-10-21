import { expect, test, type Page } from '@playwright/test';
import { createTurnLog, turnProblems, type ReportedTurn, type TurnLog } from './live-turns';

/**
 * Checks against a real provider, run by `pnpm test:ai-live` with
 * AI_E2E_PROVIDER=claude or codex and that CLI signed in. They spend a little
 * of the author's own account.
 */

/**
 * The way the author gets there — a scene's address alone opens nothing on a
 * fresh profile — and connected to the bridge the config started.
 */
async function openConnectedEditor(page: Page): Promise<void> {
  page.setDefaultTimeout(60_000);
  // The first page waits for a cold bundle, which on a busy machine takes minutes.
  await page.goto('/', { timeout: 300_000 });
  await page.getByRole('button', { name: 'Studio', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'New story', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'The Forgotten Library', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Edit novel', exact: true }).click();
  await page.getByText('AI', { exact: true }).click();
  // The config hands the app the bridge and its token. The app starts with
  // its default provider, finds another one running there, and offers to switch.
  const connected = page.getByText(/Connected ·|Підключено ·/).first();
  const useDetected = page.getByRole('button', { name: /^(Use|Використати) / });
  await expect(connected.or(useDetected)).toBeVisible({ timeout: 120_000 });
  if (await useDetected.isVisible().catch(() => false)) await useDetected.click();
  await expect(connected).toBeVisible({ timeout: 120_000 });
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/).fill(text);
  await page.getByRole('button', { name: /Send|Надіслати/ }).click();
}

/** Every frame the bridge sends to the page, gathered into turns. Set up before the page opens. */
function watchTurns(page: Page): TurnLog {
  const log = createTurnLog();
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => { if (typeof payload === 'string') log.receive(payload); });
  });
  return log;
}

/**
 * Waits for the next turn the bridge reports after this call, then for the
 * page to be ready for words again. Ask for it before sending: a quick turn
 * can be over by the time the send returns.
 */
function nextTurn(page: Page, log: TurnLog): (timeout: number) => Promise<ReportedTurn> {
  const seen = log.turns.length;
  return async (timeout) => {
    await expect.poll(() => log.turns.length, { timeout, message: 'the bridge reported no end of the turn' }).toBeGreaterThan(seen);
    // Send says nothing about this: it stays disabled for an empty composer.
    await expect(page.getByRole('button', { name: /Stop|Зупинити/ })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByPlaceholder(/Message the assistant|Повідомлення асистенту/)).toBeEnabled();
    return log.turns[seen];
  };
}

test('one read-only Ukrainian provider smoke', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const log = watchTurns(page);
  await openConnectedEditor(page);
  const turn = nextTurn(page, log);
  await send(page, 'Відповідай одним коротким реченням українською: чи ти готовий допомогти з цією сценою? Нічого не змінюй і не створюй зображень.');

  const answered = await turn(3 * 60_000);
  expect(turnProblems(answered, { needsText: true }), JSON.stringify(answered)).toEqual([]);
  await expect(page.getByRole('button', { name: /Apply|Застосувати/ })).toHaveCount(0);
  console.log(JSON.stringify({ provider: process.env.AI_E2E_PROVIDER, result: 'passed', stopReason: answered.stopReason, recordedAt: new Date().toISOString() }));
});

/**
 * Check V2 of the editor-context plan. A proposal waits for the author inside
 * one tool call of the provider's turn, and the author may take minutes. The
 * call must not be cut off by the provider's own tool limit (the bridge starts
 * Claude Code with MCP_TOOL_TIMEOUT above a card's lifetime), and the turn's
 * clock stands still while the card is up.
 */
test('a proposal that waits more than two minutes for the author still lands, and its turn ends', async ({ page }) => {
  test.setTimeout(12 * 60_000);
  const log = watchTurns(page);
  await openConnectedEditor(page);
  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');
  await editable.locator('p[data-kind="text"]').first().click({ clickCount: 3 });
  const turn = nextTurn(page, log);
  await send(page, 'Propose a scene patch that replaces exactly the selected words with "The library was silent." and changes nothing else. Use propose_scene_patch once and then wait for my decision.');

  const apply = page.getByRole('button', { name: /Apply|Застосувати/ });
  await expect(apply).toBeVisible({ timeout: 4 * 60_000 });
  const shownAt = Date.now();
  // The author takes their time.
  await page.waitForTimeout(150_000);
  await expect(apply).toBeVisible();
  await apply.click();

  await expect(editable).toContainText('The library was silent.', { timeout: 30_000 });
  // The turn that waited goes on to an end of its own, not to an error or a timeout.
  const finished = await turn(4 * 60_000);
  expect(turnProblems(finished), JSON.stringify(finished)).toEqual([]);
  console.log(JSON.stringify({ provider: process.env.AI_E2E_PROVIDER, check: 'V2', waitedMs: Date.now() - shownAt, result: 'passed', stopReason: finished.stopReason, recordedAt: new Date().toISOString() }));
});
