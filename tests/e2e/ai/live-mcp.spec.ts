import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * The plan's live smoke test: one real MCP client, the author's own, does
 * what an agent is there for. It is told only the goal; the way there — the
 * binding, the step the selection is addressed to, the revision, waiting for
 * the author — it has to learn from what the bridge says about its tools.
 *
 * Run with `pnpm test:ai-mcp-live`, `AI_MCP_CLIENT=claude` or `codex`, the
 * client signed in. `AI_MCP_LIVE_MODEL` picks the model; for Codex it is
 * otherwise the one in `~/.codex/config.toml`.
 */

const NEW_LINE = 'A real agent rewrote this line.';

const PROMPT = [
  'The MCP server "vne" connects you to a visual novel editor that an author has open.',
  'The author has selected a line in a scene and handed it to you.',
  `Propose a change that replaces the text of exactly that line with "${NEW_LINE}" and changes nothing else.`,
  'Then wait for the author to decide on it, and reply with how the proposal ended, in one word.',
  'Use only the tools of "vne". Do not run shell commands and do not touch any files.',
].join('\n');

interface AgentRun {
  code: number | null;
  output: string;
  lastMessage: string;
}

/** Windows starts `claude` and `codex` through a `.cmd` shim, which only a shell runs. */
function argForShell(arg: string): string {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

/** What went wrong, without the pages of instructions a client prints on the way. */
function failureOf(run: AgentRun): string {
  const errors = [...new Set(run.output.split(/\r?\n|\r/)
    .filter(line => /^(ERROR|Error)\b/.test(line.trim()))
    // A client may echo a whole request back in one of them.
    .map(line => (line.length > 600 ? `${line.slice(0, 150)} … ${line.slice(-300)}` : line)))];
  return errors.length > 0 ? errors.join('\n') : run.output.slice(-4000);
}

function codexModel(): string | undefined {
  if (process.env.AI_MCP_LIVE_MODEL) return process.env.AI_MCP_LIVE_MODEL;
  const config = path.join(process.env.CODEX_HOME ?? path.join(homedir(), '.codex'), 'config.toml');
  if (!existsSync(config)) return undefined;
  return /^model\s*=\s*"([^"]+)"/m.exec(readFileSync(config, 'utf8'))?.[1];
}

/**
 * The client, started for this run alone: no MCP server of the author's own
 * configuration, only this bridge, and no session kept afterwards.
 */
function startAgent(client: 'claude' | 'codex', workdir: string): { done: Promise<AgentRun>; stop: () => void } {
  const endpoint = `http://${process.env.AI_MCP_LIVE_BRIDGE}/mcp`;
  const token = process.env.AI_MCP_LIVE_MCP_TOKEN ?? '';
  const lastMessageFile = path.join(workdir, 'last-message.txt');
  const secrets = mkdtempSync(path.join(tmpdir(), 'vne-mcp-client-'));
  const model = client === 'codex' ? codexModel() : process.env.AI_MCP_LIVE_MODEL;
  let command: string;
  let args: string[];
  if (client === 'claude') {
    const mcpConfig = path.join(secrets, 'mcp.json');
    writeFileSync(mcpConfig, JSON.stringify({
      mcpServers: { vne: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } } },
    }));
    command = 'claude';
    args = ['-p', '--strict-mcp-config', '--mcp-config', mcpConfig, '--allowedTools', 'mcp__vne', '--output-format', 'text',
      ...(model ? ['--model', model] : [])];
  } else {
    command = 'codex';
    args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', workdir,
      ...(model ? ['-m', model] : []),
      '-c', `mcp_servers.vne.url=${endpoint}`, '-c', 'mcp_servers.vne.bearer_token_env_var=VNE_MCP_TOKEN',
      '-o', lastMessageFile, '-'];
  }
  const env = { ...process.env, VNE_MCP_TOKEN: token };
  const child = process.platform === 'win32'
    ? spawn([command, ...args.map(argForShell)].join(' '), { cwd: workdir, env, shell: true, windowsHide: true })
    : spawn(command, args, { cwd: workdir, env });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { output += chunk; });
  child.stderr.on('data', (chunk: string) => { output += chunk; });
  child.stdin.end(PROMPT);
  const done = new Promise<AgentRun>((resolve) => {
    child.on('close', (code) => {
      rmSync(secrets, { recursive: true, force: true });
      const lastMessage = client === 'codex'
        ? (existsSync(lastMessageFile) ? readFileSync(lastMessageFile, 'utf8') : '')
        : output;
      resolve({ code, output, lastMessage: lastMessage.trim() });
    });
  });
  return { done, stop: () => { if (child.exitCode === null) child.kill(); } };
}

test('a real MCP client rewrites the line the author handed it, and only that line', async ({ page }, testInfo) => {
  const client = process.env.AI_MCP_CLIENT as 'claude' | 'codex';
  test.setTimeout(8 * 60_000);

  // The way the author gets there; a scene's address alone opens nothing on a fresh profile.
  await page.goto('/');
  await page.getByRole('button', { name: 'Studio', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'New story', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'The Forgotten Library', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Edit novel', exact: true }).click();
  await page.getByText('AI', { exact: true }).click();
  await page.getByText(/^(No chat|Без чату)$/).click();
  await page.getByText(/Advanced connection settings|Розширені налаштування підключення/).click();
  await page.getByLabel(/Local bridge URL|Локальна адреса моста/).fill(`ws://${process.env.AI_MCP_LIVE_BRIDGE}`);
  await page.getByLabel(/Pairing token|Токен підключення/).fill(process.env.AI_MCP_LIVE_TOKEN ?? '');
  await page.getByRole('button', { name: /Connect|Підключити/ }).click();
  await expect(page.getByText(/Connected · external agent only|Підключено · лише зовнішній агент/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/AI settings|Налаштування AI/).click();
  await page.getByLabel(/^(External agent access: Read and propose|Доступ зовнішнього агента: Читання й пропозиції)$/).click();
  await page.getByLabel(/^(Close|Закрити)$/).click();

  const editable = page.frameLocator('iframe[title="VN Plate editor"]').first().locator('#editor');
  const selected = editable.locator('p[data-kind="text"]').first();
  const neighbour = editable.locator('.choice-block').first();
  const untouched = await neighbour.innerText();
  await selected.click({ clickCount: 3 });
  await page.getByRole('button', { name: /Save and hand to agent|Зберегти й передати агенту/ }).click();
  await expect(page.getByText(/^(Handed over at|Передано о)/)).toBeVisible();

  const agent = startAgent(client, testInfo.outputPath());
  try {
    const card = page.getByText(/Proposed by an external agent|Пропозиція зовнішнього агента/);
    const first = await Promise.race([
      card.waitFor({ timeout: 6 * 60_000 }).then(() => 'card' as const, () => 'no card' as const),
      agent.done.then(() => 'finished' as const),
    ]);
    if (first !== 'card') {
      agent.stop();
      const run = await agent.done;
      throw new Error(`${client} put no proposal in front of the author (exit ${run.code}):\n${failureOf(run)}`);
    }
    await page.getByRole('button', { name: /Apply|Застосувати/ }).click();

    await expect(editable).toContainText(NEW_LINE);
    expect(await neighbour.innerText()).toBe(untouched);
    const run = await agent.done;
    expect(run.code, failureOf(run)).toBe(0);
    expect(run.lastMessage.toLowerCase()).toContain('applied');
    console.log(JSON.stringify({ client, result: 'passed', lastMessage: run.lastMessage, recordedAt: new Date().toISOString() }));
  } finally {
    agent.stop();
  }
});
