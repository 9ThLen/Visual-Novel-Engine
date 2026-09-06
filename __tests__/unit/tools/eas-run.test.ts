/**
 * The EAS mechanics both build paths now share.
 *
 * They were two implementations until the CLI's half was found to submit a
 * build and then hold nothing — no artifact, no record, no way back to a build
 * whose terminal had closed. These cases cover what the helper's own tests do
 * not reach: watching a build nobody in this process started, and the Windows
 * shell requirement that the helper's spawn path had never actually run.
 */
import { followEasBuild, spawnEas, type EasCommandResult, type RunEasCommand } from '../../../tools/vne-build/eas-run';

function scripted(statuses: string[]): { run: RunEasCommand; calls: string[][] } {
  const calls: string[][] = [];
  let index = 0;
  const run: RunEasCommand = async (args) => {
    calls.push(args);
    if (args[0] !== 'build:view') return { status: 0, stdout: '{}', stderr: '' } as EasCommandResult;
    const status = statuses[Math.min(index, statuses.length - 1)];
    index += 1;
    return {
      status: 0,
      stdout: JSON.stringify([{ id: 'b1', status, artifacts: { applicationArchiveUrl: 'https://x/y.apk' } }]),
      stderr: '',
    };
  };
  return { run, calls };
}

function follow(run: RunEasCommand, extra: Partial<Parameters<typeof followEasBuild>[0]> = {}) {
  return followEasBuild({
    runCommand: run,
    buildId: 'b1',
    cwd: '.',
    signal: new AbortController().signal,
    onLog: () => {},
    pollIntervalMs: 0,
    ...extra,
  });
}

describe('following an EAS build', () => {
  it('polls until it finishes and returns the record', async () => {
    const { run, calls } = scripted(['IN_QUEUE', 'IN_PROGRESS', 'FINISHED']);
    const build = await follow(run);
    expect(build.status).toBe('FINISHED');
    expect(calls.filter((call) => call[0] === 'build:view')).toHaveLength(3);
  });

  it('uses the record it was handed rather than asking again', async () => {
    const { run, calls } = scripted(['FINISHED']);
    const build = await follow(run, { initial: { id: 'b1', status: 'FINISHED' } });
    expect(build.status).toBe('FINISHED');
    expect(calls).toEqual([]);
  });

  it.each(['ERRORED', 'CANCELED'])('throws on %s rather than waiting forever', async (status) => {
    const { run } = scripted([status]);
    await expect(follow(run)).rejects.toThrow(status.toLowerCase());
  });

  describe('when the caller gives up', () => {
    it('cancels the build it started', async () => {
      const { run, calls } = scripted(['IN_PROGRESS']);
      const controller = new AbortController();
      const pending = follow(run, { signal: controller.signal, cancelOnAbort: true });
      controller.abort();
      await expect(pending).rejects.toThrow('cancelled');
      expect(calls.some((call) => call[0] === 'build:cancel')).toBe(true);
    });

    /**
     * `--from-build` watches a build it did not submit. Cancelling there would
     * destroy work the watcher does not own — and that someone already paid for.
     */
    it('leaves a build it is only watching alone', async () => {
      const { run, calls } = scripted(['IN_PROGRESS']);
      const controller = new AbortController();
      const pending = follow(run, { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toThrow('cancelled');
      expect(calls.some((call) => call[0] === 'build:cancel')).toBe(false);
    });
  });
});

describe('running the EAS CLI', () => {
  /**
   * Windows needs a shell to start `eas.cmd`, and a shell turns arguments into
   * a command line. Nothing is passed that could end one.
   */
  it('refuses an argument that could escape a shell', async () => {
    if (process.platform !== 'win32') return;
    await expect(spawnEas()(['build:view', 'b1 && shutdown'], { cwd: '.' }))
      .rejects.toThrow('Refusing to pass');
  });

  /**
   * The shapes real arguments take — a build id, a subcommand, a flag, a path.
   * A guard that rejected any of these would break the thing it protects, and
   * would do it only on Windows, where it is hardest to notice.
   */
  it('lets the arguments a build actually uses through', async () => {
    if (process.platform !== 'win32') return;
    const result = await spawnEas('definitely-not-a-command')(
      ['build:view', 'a951aec6-08e2-41c0-be5c-e23c22fca815', '--json', './out'],
      { cwd: '.' },
    );
    // It reached the shell and the shell could not find the command, which is
    // the failure that proves the guard did not stop it.
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not recognized|not found/i);
  });
});
