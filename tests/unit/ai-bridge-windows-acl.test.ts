// @vitest-environment node
import type { SpawnSyncReturns } from 'node:child_process';
import {
  PERMITTED_SIDS,
  icaclsArgs,
  inspectionProblems,
  inspectionScript,
  parseInspection,
  parseOwnerSid,
  resetChildArgs,
  restrictDirectoryToOwner,
  unexpectedSids,
} from '../../tools/ai-bridge/src/windows-acl';

const OWNER = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
const OTHER_DOMAIN_ANNA = 'S-1-5-21-9999999999-8888888888-7777777777-1001';
const SANDBOX_GROUP = 'S-1-5-21-1111111111-2222222222-3333333333-1015';

function ok(stdout = ''): SpawnSyncReturns<string> {
  return { pid: 1, output: [], stdout, stderr: '', status: 0, signal: null };
}

/** A run that answers the SID query, the icacls calls, and the inspection. */
function scriptedRun(inspection: unknown, options: { calls?: string[][] } = {}) {
  return (command: string, args: readonly string[]) => {
    options.calls?.push([command, ...args]);
    if (command === 'powershell') {
      // Both scripts ask Windows who is running; only the inspection reads ACLs.
      const script = args[args.length - 1];
      return script.includes('Get-Acl') ? ok(JSON.stringify(inspection)) : ok(`${OWNER}\r\n`);
    }
    return ok();
  };
}

describe('identifying the account', () => {
  it('accepts a SID and refuses anything else', () => {
    expect(parseOwnerSid(` ${OWNER}\r\n`)).toBe(OWNER);
    // Granting to a mangled principal grants to nobody while reporting success.
    expect(() => parseOwnerSid('')).toThrow(/could not determine/);
    expect(() => parseOwnerSid('DESKTOP-7\\ada')).toThrow(/could not determine/);
  });

  it('grants by SID, not by a name that two domains can share', () => {
    // DOMAIN-A\\anna and DOMAIN-B\\anna are different people whose names compare
    // equal. An earlier version compared names and would have confused them.
    expect(icaclsArgs('C:\\dir', OWNER)).toEqual([
      'C:\\dir', '/inheritance:r', '/grant:r', `*${OWNER}:(OI)(CI)F`,
    ]);
  });
});

describe('what counts as an unexpected entry', () => {
  it('permits the owner and the two system SIDs, by number', () => {
    // S-1-5-18 and S-1-5-32-544 are the same in every language Windows ships
    // in, which is the point of not matching "SYSTEM" and "Administrators".
    expect(PERMITTED_SIDS).toEqual(['S-1-5-18', 'S-1-5-32-544']);
    expect(unexpectedSids([OWNER, ...PERMITTED_SIDS], OWNER)).toEqual([]);
  });

  it('does not confuse two accounts that share a name in different domains', () => {
    expect(unexpectedSids([OWNER, OTHER_DOMAIN_ANNA], OWNER)).toEqual([OTHER_DOMAIN_ANNA]);
  });

  it('flags a group the owner never chose', () => {
    expect(unexpectedSids([OWNER, SANDBOX_GROUP], OWNER)).toEqual([SANDBOX_GROUP]);
  });
});

describe('reading the ACL report', () => {
  it('accepts the single-entry shape Windows PowerShell collapses to an object', () => {
    const parsed = parseInspection(JSON.stringify({
      owner: OWNER,
      entries: { path: 'C:\\dir', protected: true, sids: [OWNER] },
    }));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].sids).toEqual([OWNER]);
  });

  it('refuses a report it could not parse, rather than reading it as empty', () => {
    // A parser that recognised nothing previously concluded "nobody has
    // access", which is the most dangerous thing it could conclude.
    expect(() => parseInspection('')).toThrow(/could not read the ACL report/);
    expect(() => parseInspection('icacls: Access is denied.')).toThrow(/could not read the ACL report/);
  });

  it('refuses a report with no owner SID', () => {
    expect(() => parseInspection(JSON.stringify({ entries: [] }))).toThrow(/named no owner SID/);
  });

  it('refuses an entry that lists no access at all', () => {
    expect(() => parseInspection(JSON.stringify({
      owner: OWNER,
      entries: [{ path: 'C:\\dir', protected: true, sids: [] }],
    }))).toThrow(/listed no entries at all/);
  });
});

describe('judging an inspection', () => {
  const clean = { path: 'C:\\dir', protected: true, sids: [OWNER, 'S-1-5-18'] };

  it('passes a directory that only the owner and the system reach', () => {
    expect(inspectionProblems({ ownerSid: OWNER, entries: [clean] }, ['C:\\dir'])).toEqual([]);
  });

  it('names a secret with its own explicit entry, not just the directory', () => {
    // A `token` that predates this, or that someone granted access to, keeps its
    // own ACL no matter what the directory says. Checking only the directory was
    // the previous round's gap.
    const problems = inspectionProblems({
      ownerSid: OWNER,
      entries: [clean, { path: 'C:\\dir\\token', protected: true, sids: [OWNER, SANDBOX_GROUP] }],
    }, ['C:\\dir']);
    expect(problems).toEqual([`C:\\dir\\token is also accessible to ${SANDBOX_GROUP}`]);
  });

  it('names a path that still inherits from above it', () => {
    const problems = inspectionProblems({
      ownerSid: OWNER,
      entries: [{ ...clean, protected: false }],
    }, ['C:\\dir']);
    expect(problems).toEqual(['C:\\dir still inherits permissions from the folders above it']);
  });

  it('notices a path the report skipped entirely', () => {
    // A silently skipped secret is exactly the failure this exists to catch.
    expect(inspectionProblems({ ownerSid: OWNER, entries: [] }, ['C:\\dir']))
      .toEqual(['C:\\dir was not reported on']);
  });
});

describe('applying the restriction', () => {
  it('asks for the SID, applies, resets existing secrets, then verifies', () => {
    const calls: string[][] = [];
    const run = scriptedRun(
      { owner: OWNER, entries: [{ path: 'C:\\dir', protected: true, sids: [OWNER] }] },
      { calls },
    );

    expect(restrictDirectoryToOwner('C:\\dir', {
      platform: 'win32', files: ['C:\\dir\\token'], run,
    })).toEqual({ applied: true });

    expect(calls.map(call => call[0])).toEqual(['powershell', 'icacls', 'icacls', 'powershell']);
    expect(calls[2]).toEqual(['icacls', ...resetChildArgs('C:\\dir\\token')]);
  });

  it('fails when the verification finds someone else', () => {
    const run = scriptedRun({
      owner: OWNER,
      entries: [{ path: 'C:\\dir', protected: true, sids: [OWNER, SANDBOX_GROUP] }],
    });
    const result = restrictDirectoryToOwner('C:\\dir', { platform: 'win32', run });
    expect(result.applied).toBe(false);
    expect(result).toMatchObject({ reason: expect.stringContaining(SANDBOX_GROUP) });
  });

  it('fails when the report cannot be read', () => {
    const run = (command: string, args: readonly string[]) =>
      command === 'powershell' && args[args.length - 1].includes('Get-Acl')
        ? ok('not json at all')
        : ok(`${OWNER}\r\n`);
    const result = restrictDirectoryToOwner('C:\\dir', { platform: 'win32', run });
    expect(result.applied).toBe(false);
    expect(result).toMatchObject({ reason: expect.stringContaining('could not read the ACL report') });
  });

  it('tolerates a secret that does not exist yet', () => {
    // First run: the files are about to be created inside a restricted folder.
    const run = (command: string, args: readonly string[]): SpawnSyncReturns<string> => {
      if (command === 'powershell') {
        return args[args.length - 1].includes('Get-Acl')
          ? ok(JSON.stringify({ owner: OWNER, entries: [{ path: 'C:\\dir', protected: true, sids: [OWNER] }] }))
          : ok(`${OWNER}\r\n`);
      }
      if (args.includes('/reset')) {
        return { ...ok(), status: 1, stderr: 'The system cannot find the file specified.' };
      }
      return ok();
    };
    expect(restrictDirectoryToOwner('C:\\dir', { platform: 'win32', files: ['C:\\dir\\token'], run }))
      .toEqual({ applied: true });
  });

  it('does nothing on POSIX, where the file mode already did it', () => {
    const calls: string[][] = [];
    const run = scriptedRun({}, { calls });
    expect(restrictDirectoryToOwner('/dir', { platform: 'linux', run }))
      .toEqual({ applied: false, reason: 'not-windows' });
    expect(calls).toHaveLength(0);
  });
});

describe('the inspection script', () => {
  it('asks about every path it is given, and escapes quotes in them', () => {
    const script = inspectionScript(['C:\\dir', "C:\\it's\\token"]);
    expect(script).toContain("'C:\\dir'");
    expect(script).toContain("'C:\\it''s\\token'");
    expect(script).toContain('AreAccessRulesProtected');
    expect(script).toContain('SecurityIdentifier');
  });
});
