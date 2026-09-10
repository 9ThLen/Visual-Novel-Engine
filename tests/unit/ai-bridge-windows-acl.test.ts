// @vitest-environment node
import type { SpawnSyncReturns } from 'node:child_process';
import {
  bareAccountName,
  icaclsArgs,
  ownerPrincipal,
  parseAclPrincipals,
  restrictDirectoryToOwner,
  unexpectedPrincipals,
} from '../../tools/ai-bridge/src/windows-acl';

/** Shaped like real `icacls <dir>` output: first entry shares the path's line. */
function icaclsOutput(dir: string, entries: readonly string[]): string {
  return [
    `${dir} ${entries[0]}`,
    ...entries.slice(1).map(entry => `      ${entry}`),
    'Successfully processed 1 files; Failed processing 0 files',
    '',
  ].join('\r\n');
}

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

  it('applies the ACL and then reads it back, because applying is not proof', () => {
    const { calls, run } = runner({ status: 0, stdout: icaclsOutput('C:\\dir', ['ada:(OI)(CI)(F)']) });
    expect(restrictDirectoryToOwner('C:\\dir', { platform: 'win32', env: {}, username: 'ada', run }))
      .toEqual({ applied: true });
    expect(calls.map(call => call.command)).toEqual(['icacls', 'icacls']);
    expect(calls[0].args).toContain('/inheritance:r');
    expect(calls[1].args).toEqual(['C:\\dir']);
  });

  it('does nothing on POSIX, where the file mode already did it', () => {
    const { calls, run } = runner({ status: 0, stdout: '' });
    expect(restrictDirectoryToOwner('/dir', { platform: 'linux', env: {}, username: 'ada', run }))
      .toEqual({ applied: false, reason: 'not-windows' });
    expect(calls).toHaveLength(0);
  });

  it('reads the principals out of icacls output, whatever language it is in', () => {
    const output = icaclsOutput('C:\\dir', [
      'NT AUTHORITY\\SYSTEM:(OI)(CI)(F)',
      'BUILTIN\\Administrators:(OI)(CI)(F)',
      'DESKTOP-7\\ada:(OI)(CI)(F)',
      'DESKTOP-7\\CodexSandboxUsers:(OI)(CI)(RX)',
    ]);
    expect(parseAclPrincipals(output, 'C:\\dir')).toEqual([
      'NT AUTHORITY\\SYSTEM',
      'BUILTIN\\Administrators',
      'DESKTOP-7\\ada',
      'DESKTOP-7\\CodexSandboxUsers',
    ]);
  });

  it('matches the owner however icacls chose to qualify the name', () => {
    // icacls reports MACHINE\\ada while the granted principal may be bare `ada`.
    // Comparing them as written marks the owner's own entry as a stranger's —
    // and the first version of this then tried to remove it, which would have
    // locked the author out of their own directory.
    expect(bareAccountName('DESKTOP-7\\ada')).toBe('ADA');
    expect(bareAccountName('ada')).toBe('ADA');
    expect(unexpectedPrincipals(['DESKTOP-7\\ada'], 'ada')).toEqual([]);
    expect(unexpectedPrincipals(['ada'], 'CORP\\ada')).toEqual([]);
  });

  it('treats only the owner and the system accounts as expected', () => {
    // An administrator can take ownership of any file and SYSTEM is how backup
    // reaches it, so excluding those two would be theatre. A sandbox group the
    // owner never chose is not.
    const principals = [
      'NT AUTHORITY\\SYSTEM',
      'BUILTIN\\Administrators',
      'DESKTOP-7\\ada',
      'DESKTOP-7\\CodexSandboxUsers',
    ];
    expect(unexpectedPrincipals(principals, 'ada')).toEqual(['DESKTOP-7\\CodexSandboxUsers']);
    expect(unexpectedPrincipals(principals, 'DESKTOP-7\\ada')).toEqual(['DESKTOP-7\\CodexSandboxUsers']);
  });

  it("refuses on an explicit entry rather than deleting someone else's", () => {
    // Deciding which principal is safe to remove means classifying names that
    // are localised and domain-qualified. Getting that wrong locks the author
    // out of their own directory, which is worse than what is being fixed — so
    // the survivor is named and the decision goes to a person.
    const run = (_command: string, args: readonly string[]) => ({
      pid: 1, output: [], status: 0, signal: null, stderr: '',
      stdout: args.length === 1
        ? icaclsOutput('C:\\dir', ['ada:(OI)(CI)(F)', 'DESKTOP-7\\CodexSandboxUsers:(OI)(CI)(RX)'])
        : '',
    }) as never;

    const result = restrictDirectoryToOwner('C:\\dir', { platform: 'win32', env: {}, username: 'ada', run });
    expect(result.applied).toBe(false);
    expect(result).toMatchObject({ reason: expect.stringContaining('DESKTOP-7\\CodexSandboxUsers') });
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
