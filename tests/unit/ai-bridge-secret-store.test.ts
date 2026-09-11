// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';

import {
  protectScript,
  protectSecret,
  revealSecret,
  revealStoredSecrets,
  storeSecret,
  unprotectScript,
  type SecretRunner,
} from '../../tools/ai-bridge/src/secret-store';

const home = () => mkdtempSync(join(tmpdir(), 'vne-secrets-'));

function ok(stdout = ''): SpawnSyncReturns<string> {
  return { pid: 1, output: [], stdout, stderr: '', status: 0, signal: null };
}

/** The header every DPAPI blob starts with, so the fake looks like one. */
const DPAPI_HEADER = '01000000d08c9ddf0115d1118c7a00c04fc297eb';

/** A stand-in for DPAPI: reversible, and unmistakably not the plaintext. */
function fakeDpapi(calls: { input: string[] } = { input: [] }): SecretRunner {
  return (_command, args, options) => {
    const input = String(options.input ?? '');
    calls.input.push(input);
    const script = args[args.length - 1];
    if (script.includes('ConvertFrom-SecureString')) {
      return ok(`${DPAPI_HEADER}${Buffer.from(input, 'utf8').toString('hex')}\r\n`);
    }
    return ok(Buffer.from(input.trim().slice(DPAPI_HEADER.length), 'hex').toString('utf8'));
  };
}

describe('protecting the API key', () => {
  it('seals it on Windows, and can open it again', () => {
    const run = fakeDpapi();
    const sealed = protectSecret('sk-the-real-one', { platform: 'win32', run });

    expect(sealed.protection).toBe('dpapi');
    expect(sealed.value).not.toContain('sk-the-real-one');
    expect(revealSecret(sealed, { platform: 'win32', run })).toBe('sk-the-real-one');
  });

  it('never puts the key on a command line', () => {
    // Every process on Windows can read every other process's command line, so
    // an API key passed as an argument is readable by anything running as the
    // author — which is most of what sealing it protects against.
    const calls = { input: [] as string[] };
    const run: SecretRunner = (_command, args, options) => {
      expect(args.join(' ')).not.toContain('sk-the-real-one');
      return fakeDpapi(calls)(_command, args, options);
    };
    protectSecret('sk-the-real-one', { platform: 'win32', run });
    expect(calls.input).toEqual(['sk-the-real-one']);
  });

  it('says plainly that POSIX has no seal, rather than implying one', () => {
    const sealed = protectSecret('sk-1', { platform: 'linux' });
    expect(sealed).toEqual({ protection: 'file', value: 'sk-1' });
  });

  it('refuses a Windows answer that is not a protected value', () => {
    // Storing whatever PowerShell printed would lose the key and report success.
    const run: SecretRunner = () => ok('Access is denied.\r\n');
    expect(() => protectSecret('sk-1', { platform: 'win32', run }))
      .toThrow(/no protected value/);
  });

  it('carries the reason a seal failed', () => {
    const run: SecretRunner = () => ({ ...ok(), status: 1, stderr: 'the key set is not defined' });
    expect(() => protectSecret('sk-1', { platform: 'win32', run })).toThrow(/key set is not defined/);
  });
});

describe('the store on disk', () => {
  it('keeps the other keys when one is written', () => {
    const dir = home();
    const file = join(dir, 'secrets.json');
    const run = fakeDpapi();

    storeSecret(file, 'OPENAI_API_KEY', 'sk-openai', { platform: 'win32', run });
    storeSecret(file, 'GEMINI_API_KEY', 'g-gemini', { platform: 'win32', run });

    const revealed = revealStoredSecrets(file, { platform: 'win32', run });
    expect(revealed.values).toEqual({ OPENAI_API_KEY: 'sk-openai', GEMINI_API_KEY: 'g-gemini' });
    expect(revealed.problems).toEqual([]);
  });

  it('writes no plaintext', () => {
    const dir = home();
    const file = join(dir, 'secrets.json');
    storeSecret(file, 'OPENAI_API_KEY', 'sk-the-real-one', { platform: 'win32', run: fakeDpapi() });

    expect(readFileSync(file, 'utf8')).not.toContain('sk-the-real-one');
  });

  it('names a key it cannot open instead of starting without it', () => {
    // A key sealed by another account, or restored from another machine's
    // backup. Dropping it silently produces "the model refuses everything"
    // rather than "your saved key is unreadable on this account".
    const dir = home();
    const file = join(dir, 'secrets.json');
    writeFileSync(file, JSON.stringify({
      version: 1,
      secrets: { OPENAI_API_KEY: { protection: 'dpapi', value: 'ff00' } },
    }));
    const run: SecretRunner = () => ({ ...ok(), status: 1, stderr: 'Key not valid for use in specified state.' });

    const revealed = revealStoredSecrets(file, { platform: 'win32', run });
    expect(revealed.values).toEqual({});
    expect(revealed.problems).toEqual(['OPENAI_API_KEY: Key not valid for use in specified state.']);
  });

  it('treats no store as no keys', () => {
    expect(revealStoredSecrets(join(home(), 'absent.json'))).toEqual({ values: {}, problems: [] });
  });

  it('refuses to read a store it cannot parse', () => {
    const file = join(home(), 'secrets.json');
    writeFileSync(file, '{ not json');
    expect(() => revealStoredSecrets(file)).toThrow(/could not read the saved keys/);
  });
});

describe('the PowerShell it runs', () => {
  it('takes the value from standard input in both directions', () => {
    expect(protectScript()).toContain('[Console]::In.ReadToEnd()');
    expect(unprotectScript()).toContain('[Console]::In.ReadToEnd()');
    // Freed rather than left in the process: a BSTR holds the plaintext.
    expect(unprotectScript()).toContain('ZeroFreeBSTR');
  });
});
