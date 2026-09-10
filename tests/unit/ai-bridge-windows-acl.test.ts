// @vitest-environment node
import type { SpawnSyncReturns } from 'node:child_process';
import {
  icaclsArgs,
  ownerPrincipal,
  restrictDirectoryToOwner,
} from '../../tools/ai-bridge/src/windows-acl';

function runner(result: Partial<SpawnSyncReturns<string>>) {
  const calls: { command: string; args: readonly string[] }[] = [];
  const run = (command: string, args: readonly string[]) => {
    calls.push({ command, args });
    return { pid: 1, output: [], stdout: '', stderr: '', status: 0, signal: null, ...result } as SpawnSyncReturns<string>;
  };
  return { calls, run };
}

describe('restricting the bridge directory on Windows', () => {
  it('drops inherited entries rather than adding to them', () => {
    // The inherited ACL already let a group in — on a real machine it carried an
    // entry the owner never chose. Granting the owner on top of that changes
    // nothing, so the inherited entries have to go.
    expect(icaclsArgs('C:\\dir', 'ADA')).toEqual([
      'C:\\dir', '/inheritance:r', '/grant:r', 'ADA:(OI)(CI)F',
    ]);
  });

  it('makes the grant inheritable, because the point is the files inside', () => {
    // The token and the settings file are what need protecting; a grant on the
    // directory alone would leave both exactly as they were.
    expect(icaclsArgs('C:\\dir', 'ADA')[3]).toContain('(OI)(CI)');
  });

  it('qualifies the account by domain, but not with the machine name', () => {
    expect(ownerPrincipal({ USERDOMAIN: 'CORP' }, 'ada')).toBe('CORP\\ada');
    expect(ownerPrincipal({}, 'ada')).toBe('ada');
    // A local account's USERDOMAIN is the machine name; qualifying with it is
    // what breaks after the machine is renamed.
    expect(ownerPrincipal({ USERDOMAIN: 'ADA' }, 'ada')).toBe('ada');
  });

  it('runs icacls without a shell and without a console window', () => {
    const { calls, run } = runner({ status: 0 });
    expect(restrictDirectoryToOwner('C:\\dir', { platform: 'win32', env: {}, username: 'ada', run }))
      .toEqual({ applied: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('icacls');
  });

  it('does nothing on POSIX, where the file mode already did it', () => {
    const { calls, run } = runner({ status: 0 });
    expect(restrictDirectoryToOwner('/dir', { platform: 'linux', env: {}, username: 'ada', run }))
      .toEqual({ applied: false, reason: 'not-windows' });
    expect(calls).toHaveLength(0);
  });

  it('reports a failure instead of implying a protection nobody applied', () => {
    // Silence here would recreate exactly the bug this fixes: a file believed to
    // be owner-only that is not.
    const failed = restrictDirectoryToOwner('C:\\dir', {
      platform: 'win32', env: {}, username: 'ada',
      run: runner({ status: 1, stderr: 'Access is denied.' }).run,
    });
    expect(failed).toEqual({ applied: false, reason: 'Access is denied.' });

    const missing = restrictDirectoryToOwner('C:\\dir', {
      platform: 'win32', env: {}, username: 'ada',
      run: runner({ error: new Error('spawn icacls ENOENT') }).run,
    });
    expect(missing).toEqual({ applied: false, reason: 'spawn icacls ENOENT' });
  });
});
