/**
 * The races, run as races.
 *
 * Two of the fixes in this area are about what happens when builds overlap:
 * replacing an artifact, and recording the key a story is signed with. Both had
 * tests before this file, and neither test ran anything concurrently — one
 * called `Promise.allSettled` on synchronous work, which runs it in order, and
 * the other named itself after a failure it never caused. They asserted the
 * happy path in the shape of a race, which is worse than not testing it: the
 * bug they were written for would have passed them.
 *
 * So these spawn real processes. They are slower than the rest of the suite and
 * they are the only thing here that can actually fail when the locking is
 * removed — which is the test that was missing.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { pendingPath, readSigningRecord, replaceFile } from '../../../tools/vne-build/verify-artifact';

const REPO = path.resolve(__dirname, '..', '..', '..');
const TSX = path.join(REPO, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

const WORKER = path.join(REPO, '__tests__', 'helpers', 'race-worker.ts');

function run(args: string[]): Promise<{ status: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [WORKER, ...args], {
      cwd: REPO,
      windowsHide: true,
      shell: process.platform === 'win32', // tsx is a .cmd there
    });
    let output = '';
    child.stdout?.on('data', (chunk) => { output += String(chunk); });
    child.stderr?.on('data', (chunk) => { output += String(chunk); });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status: status ?? 1, output }));
  });
}

describe('two builds at once', () => {
  let workspace: string;
  beforeEach(() => { workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vne-race-')); });
  afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

  /**
   * The destination used to be deleted before the rename, and the step-aside
   * copy that replaced it had one shared name. Either way two processes could
   * leave the artifact missing: one deletes what the other is restoring from.
   */
  it('never leaves the artifact missing while three of them replace it', async () => {
    const target = path.join(workspace, 'player.apk');
    fs.writeFileSync(target, 'the build that was already there');

    const runs = await Promise.all([
      run(['replace', target, 'alpha']),
      run(['replace', target, 'beta']),
      run(['replace', target, 'gamma']),
    ]);
    for (const { status, output } of runs) {
      expect(output).not.toContain('MISSING');
      expect(status, output).toBe(0);
    }

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toMatch(/^(alpha|beta|gamma)-\d+$/);
    // And nothing of the machinery is left behind.
    expect(fs.readdirSync(workspace)).toEqual(['player.apk']);
  }, 120_000);

  /**
   * Trust on first use is worth something only if exactly one first use can
   * win. Two processes verifying artifacts signed by different keys must not
   * both conclude they are the first.
   */
  it('lets only one key become the recorded one', async () => {
    const repoRoot = path.join(workspace, 'state');
    fs.mkdirSync(repoRoot);

    const runs = await Promise.all([
      run(['record', repoRoot, workspace]),
      run(['record', repoRoot, workspace]),
    ]);
    const transcript = runs.map((entry) => entry.output).join('\n');

    const accepted = runs.filter((entry) => entry.output.includes('ACCEPTED'));
    expect(accepted, transcript).toHaveLength(1);

    // And the record names the key that won, with nothing else beside it.
    const record = readSigningRecord(repoRoot, 'com.vne.story.race.s1');
    expect(record, transcript).toBeTruthy();
    expect(accepted[0].output).toContain(record?.fingerprint as string);
  }, 180_000);
});

/**
 * The other test that did not test what it said. `replaceFile` is meant to keep
 * the incumbent when the move fails, and the case was only ever run with a move
 * that succeeded.
 */
describe('replacing an artifact when the move fails', () => {
  let workspace: string;
  beforeEach(() => { workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vne-replace-')); });
  afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

  it('puts the previous artifact back', () => {
    const target = path.join(workspace, 'player.apk');
    fs.writeFileSync(target, 'the last good build');
    // A source that is not there: the rename fails after the incumbent has
    // already been stepped aside, which is the moment the file could be lost.
    const missing = pendingPath(target);

    expect(() => replaceFile(missing, target)).toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('the last good build');
    expect(fs.readdirSync(workspace)).toEqual(['player.apk']);
  });
});
