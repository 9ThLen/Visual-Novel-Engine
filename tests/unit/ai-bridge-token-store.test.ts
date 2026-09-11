// @vitest-environment node
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bridgeTokenFile } from '../../tools/ai-bridge/src/config-paths';
import {
  BridgeTokenError,
  generateBridgeToken,
  readOrCreateToken,
  readStoredToken,
  resetStoredToken,
} from '../../tools/ai-bridge/src/token-store';

function sandbox(): string {
  return mkdtempSync(resolve(tmpdir(), 'vne-bridge-token-'));
}

describe('bridge token store', () => {
  let dir: string;
  beforeEach(() => { dir = sandbox(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('issues a token on first run and reuses it afterwards', () => {
    const first = readOrCreateToken(dir);
    expect(first.created).toBe(true);
    expect(first.token).toMatch(/^[0-9a-f]{48}$/);

    const second = readOrCreateToken(dir);
    expect(second).toEqual({ token: first.token, created: false });
  });

  it('survives a restart, which is the whole reason it is stored', () => {
    const issued = readOrCreateToken(dir).token;
    expect(readStoredToken(dir)).toBe(issued);
  });

  it('creates the directory when it does not exist yet', () => {
    const nested = join(dir, 'missing', 'deeper');
    expect(readOrCreateToken(nested).created).toBe(true);
    expect(readStoredToken(nested)).toMatch(/^[0-9a-f]{48}$/);
  });

  it('reports no token rather than inventing one', () => {
    expect(readStoredToken(dir)).toBeNull();
  });

  it('refuses to replace an empty or corrupt token silently', () => {
    writeFileSync(bridgeTokenFile(dir), '   \n');
    expect(() => readStoredToken(dir)).toThrow(BridgeTokenError);
    expect(() => readOrCreateToken(dir)).toThrow(/empty/);

    writeFileSync(bridgeTokenFile(dir), 'not-a-token\n');
    expect(() => readOrCreateToken(dir)).toThrow(/not a valid token/);
  });

  it('names the file and the way out when it refuses', () => {
    writeFileSync(bridgeTokenFile(dir), 'nope\n');
    expect(() => readStoredToken(dir)).toThrow(new RegExp(`${'--reset-token'}`));
    try {
      readStoredToken(dir);
    } catch (error) {
      expect((error as Error).message).toContain(bridgeTokenFile(dir));
    }
  });

  it('adopts the winner when two bridges start at the same moment', () => {
    // The loser's exclusive create fails with EEXIST; it must not mint a second
    // token, or the editor ends up paired with whichever process wrote last.
    const winner = generateBridgeToken();
    writeFileSync(bridgeTokenFile(dir), `${winner}\n`, { flag: 'wx' });
    expect(readOrCreateToken(dir)).toEqual({ token: winner, created: false });
  });

  it('rotates to a different token on reset', () => {
    const original = readOrCreateToken(dir).token;
    const rotated = resetStoredToken(dir);
    expect(rotated).not.toBe(original);
    expect(readStoredToken(dir)).toBe(rotated);
  });

  it('tolerates a trailing newline, which is how it writes the file', () => {
    const token = readOrCreateToken(dir).token;
    expect(readFileSync(bridgeTokenFile(dir), 'utf8')).toBe(`${token}\n`);
  });

  it.runIf(process.platform !== 'win32')('keeps the token readable only by its owner', () => {
    readOrCreateToken(dir);
    expect(statSync(bridgeTokenFile(dir)).mode & 0o077).toBe(0);
    // Reset must not widen what create established.
    chmodSync(bridgeTokenFile(dir), 0o600);
    resetStoredToken(dir);
    expect(statSync(bridgeTokenFile(dir)).mode & 0o077).toBe(0);
  });
});
