// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';

import { applySetting, clearSetting, parseEnvFile, settingsTemplate } from '../../tools/ai-bridge/src/config-store';
import { bridgeConfigFile, bridgeSecretsFile } from '../../tools/ai-bridge/src/config-paths';
import { saveProviderKey } from '../../tools/ai-bridge/src/key-command';
import type { SecretRunner } from '../../tools/ai-bridge/src/secret-store';

const home = () => mkdtempSync(join(tmpdir(), 'vne-settings-'));

const DPAPI_HEADER = '01000000d08c9ddf0115d1118c7a00c04fc297eb';
const sealing: SecretRunner = (_command, _args, options) => ({
  pid: 1,
  output: [],
  stdout: `${DPAPI_HEADER}${Buffer.from(String(options.input ?? ''), 'utf8').toString('hex')}`,
  stderr: '',
  status: 0,
  signal: null,
} as SpawnSyncReturns<string>);

describe('editing the settings file', () => {
  it('sets a commented template line in place', () => {
    // The file a first run writes is entirely commented out. Appending would
    // leave `#AI_BRIDGE_PROVIDER=` above a live value, which reads as two
    // answers to one question.
    const out = applySetting('# a note\n#AI_BRIDGE_PROVIDER=openai\n', 'AI_BRIDGE_PROVIDER', 'gemini');
    expect(out).toBe('# a note\nAI_BRIDGE_PROVIDER=gemini\n');
  });

  it('replaces a value that is already live', () => {
    expect(applySetting('AI_BRIDGE_PROVIDER=openai\nAI_BRIDGE_PORT=8787\n', 'AI_BRIDGE_PROVIDER', 'gemini'))
      .toBe('AI_BRIDGE_PROVIDER=gemini\nAI_BRIDGE_PORT=8787\n');
  });

  it('appends a key the file never mentioned', () => {
    expect(applySetting('AI_BRIDGE_PORT=8787\n', 'AI_BRIDGE_PROVIDER', 'openai'))
      .toBe('AI_BRIDGE_PORT=8787\nAI_BRIDGE_PROVIDER=openai\n');
  });

  it('leaves a similarly named setting alone', () => {
    const out = applySetting('#OPENAI_API_KEY_BACKUP=keep\n', 'OPENAI_API_KEY', 'sk-real');
    expect(out).toContain('#OPENAI_API_KEY_BACKUP=keep');
    expect(parseEnvFile(out).OPENAI_API_KEY).toBe('sk-real');
  });

  it('does not grow a blank line on every save', () => {
    let text = settingsTemplate();
    for (let round = 0; round < 3; round += 1) text = applySetting(text, 'AI_BRIDGE_PROVIDER', 'openai');
    expect(text.endsWith('AI_BRIDGE_PROVIDER=openai\n') || !text.endsWith('\n\n')).toBe(true);
    expect(text).not.toContain('\n\n\n');
  });

  it('empties every copy of a key, not just the first', () => {
    // `parseEnvFile` keeps the last value it reads, so clearing only the first
    // would leave the old key in force — and on disk — after reporting it gone.
    const text = 'OPENAI_API_KEY=sk-old\nAI_BRIDGE_PORT=8787\nOPENAI_API_KEY=sk-older\n';
    const cleared = clearSetting(text, 'OPENAI_API_KEY');
    expect(cleared).not.toContain('sk-old');
    expect(cleared).not.toContain('sk-older');
    expect(parseEnvFile(cleared).OPENAI_API_KEY).toBeUndefined();
    expect(parseEnvFile(cleared).AI_BRIDGE_PORT).toBe('8787');
  });
});

describe('saving a key from the studio', () => {
  it('seals the key and leaves no plaintext copy behind', () => {
    const dir = home();
    writeFileSync(bridgeConfigFile(dir), 'OPENAI_API_KEY=sk-the-old-one\n');

    const saved = saveProviderKey(dir, 'openai', 'sk-the-new-one', { platform: 'win32', run: sealing });

    expect(saved.protection).toBe('dpapi');
    expect(saved.removedPlaintext).toBe(true);
    const settings = readFileSync(bridgeConfigFile(dir), 'utf8');
    expect(settings).not.toContain('sk-the-old-one');
    expect(settings).not.toContain('sk-the-new-one');
    expect(parseEnvFile(settings).AI_BRIDGE_PROVIDER).toBe('openai');
    expect(readFileSync(bridgeSecretsFile(dir), 'utf8')).not.toContain('sk-the-new-one');
  });

  it('selects the provider the key belongs to', () => {
    const dir = home();
    saveProviderKey(dir, 'gemini', 'g-key', { platform: 'linux' });

    const settings = parseEnvFile(readFileSync(bridgeConfigFile(dir), 'utf8'));
    expect(settings.AI_BRIDGE_PROVIDER).toBe('gemini');
    expect(settings.GEMINI_API_KEY).toBeUndefined();
  });

  it('writes a settings file for a machine that has none yet', () => {
    const dir = home();
    saveProviderKey(dir, 'openai', 'sk-1', { platform: 'linux' });
    expect(parseEnvFile(readFileSync(bridgeConfigFile(dir), 'utf8')).AI_BRIDGE_PROVIDER).toBe('openai');
  });

  it('refuses an empty key rather than storing one', () => {
    expect(() => saveProviderKey(home(), 'openai', '   ', { platform: 'linux' })).toThrow(/empty/);
  });

  it('stores nothing at all when the key could not be sealed', () => {
    // Otherwise the settings file would name a provider whose key was never
    // saved, and the bridge would refuse to start for a reason nobody set up.
    const dir = home();
    const failing: SecretRunner = () => ({
      pid: 1, output: [], stdout: '', stderr: 'Access is denied.', status: 1, signal: null,
    } as SpawnSyncReturns<string>);

    expect(() => saveProviderKey(dir, 'openai', 'sk-1', { platform: 'win32', run: failing }))
      .toThrow(/Access is denied/);
    expect(() => readFileSync(bridgeSecretsFile(dir), 'utf8')).toThrow();
  });
});
