// @vitest-environment node
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve, win32 } from 'node:path';
import {
  BRIDGE_HOME_ENV,
  bridgeConfigFile,
  bridgeHomeDir,
  bridgeTokenFile,
} from '../../tools/ai-bridge/src/config-paths';
import {
  applyEnvDefaults,
  ensureSettingsTemplate,
  parseEnvFile,
  readEnvFile,
  settingsTemplate,
} from '../../tools/ai-bridge/src/config-store';

describe('bridge home directory', () => {
  it('uses the per-user local app data directory on Windows', () => {
    expect(bridgeHomeDir({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' },
      home: 'C:\\Users\\ada',
    })).toBe('C:\\Users\\ada\\AppData\\Local\\VisualNovelEngine\\Bridge');
  });

  it('falls back to the profile when Windows does not set LOCALAPPDATA', () => {
    expect(bridgeHomeDir({ platform: 'win32', env: {}, home: 'C:\\Users\\ada' }))
      .toBe(win32.join('C:\\Users\\ada', 'AppData', 'Local', 'VisualNovelEngine', 'Bridge'));
  });

  // These are written out rather than built with the host's `join`, because the
  // answer must not depend on where the test runs. Spelling them with the host
  // separator passed on Linux and CI and failed on Windows, the one platform
  // that actually ships this.
  it('uses Application Support on macOS and XDG on Linux', () => {
    expect(bridgeHomeDir({ platform: 'darwin', env: {}, home: '/Users/ada' }))
      .toBe('/Users/ada/Library/Application Support/VisualNovelEngine/Bridge');
    expect(bridgeHomeDir({ platform: 'linux', env: { XDG_CONFIG_HOME: '/xdg' }, home: '/home/ada' }))
      .toBe('/xdg/visual-novel-engine/bridge');
    expect(bridgeHomeDir({ platform: 'linux', env: {}, home: '/home/ada' }))
      .toBe('/home/ada/.config/visual-novel-engine/bridge');
  });

  it('ignores a relative XDG_CONFIG_HOME, which the specification requires', () => {
    expect(bridgeHomeDir({ platform: 'linux', env: { XDG_CONFIG_HOME: 'relative' }, home: '/home/ada' }))
      .toBe('/home/ada/.config/visual-novel-engine/bridge');
  });

  it('honours an absolute override and rejects a relative one', () => {
    expect(bridgeHomeDir({ platform: 'linux', env: { [BRIDGE_HOME_ENV]: '/opt/bridge' }, home: '/home/ada' }))
      .toBe('/opt/bridge');
    expect(() => bridgeHomeDir({ platform: 'linux', env: { [BRIDGE_HOME_ENV]: './bridge' }, home: '/home/ada' }))
      .toThrow(/absolute path/);
  });

  it('honours a Windows-shaped absolute override', () => {
    expect(bridgeHomeDir({
      platform: 'win32',
      env: { [BRIDGE_HOME_ENV]: 'D:\\bridge' },
      home: 'C:\\Users\\ada',
    })).toBe('D:\\bridge');
  });

  it('does not depend on the working directory', () => {
    const options = { platform: 'linux' as const, env: {}, home: '/home/ada' };
    const before = bridgeHomeDir(options);
    const cwd = process.cwd();
    try {
      process.chdir(tmpdir());
      expect(bridgeHomeDir(options)).toBe(before);
    } finally {
      process.chdir(cwd);
    }
  });

  it('keeps the token beside the settings but in its own file', () => {
    expect(bridgeConfigFile('/home', 'linux')).toBe(posix.join('/home', 'bridge.env'));
    expect(bridgeTokenFile('/home', 'linux')).toBe(posix.join('/home', 'token'));
    expect(bridgeConfigFile('C:\\dir', 'win32')).toBe('C:\\dir\\bridge.env');
    expect(bridgeTokenFile('C:\\dir', 'win32')).toBe('C:\\dir\\token');
  });
});

describe('bridge settings file', () => {
  it('reads KEY=VALUE, skipping comments and blank lines', () => {
    expect(parseEnvFile([
      '# a comment',
      'OPENAI_API_KEY = sk-test ',
      '',
      'AI_BRIDGE_PORT="9000"',
      "AI_BRIDGE_PROVIDER='openai'",
      'not a setting',
    ].join('\n'))).toEqual({
      OPENAI_API_KEY: 'sk-test',
      AI_BRIDGE_PORT: '9000',
      AI_BRIDGE_PROVIDER: 'openai',
    });
  });

  it('treats a missing file as no settings', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'vne-bridge-'));
    try {
      expect(readEnvFile(bridgeConfigFile(dir))).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never overwrites a value the environment already carries', () => {
    const target: Record<string, string | undefined> = { AI_BRIDGE_PORT: '7000' };
    applyEnvDefaults(target, { AI_BRIDGE_PORT: '9000', OPENAI_API_KEY: 'sk-test' });
    expect(target).toEqual({ AI_BRIDGE_PORT: '7000', OPENAI_API_KEY: 'sk-test' });
  });
});

describe('the settings file a first run leaves behind', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(resolve(tmpdir(), 'vne-settings-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('parses to no settings at all until a person edits it', () => {
    // Every line is commented out on purpose: a template that took effect would
    // silently override whatever the environment already said.
    expect(parseEnvFile(settingsTemplate())).toEqual({});
  });

  it('names the provider, because the built-in default needs a separate CLI', () => {
    const text = settingsTemplate();
    expect(text).toContain('AI_BRIDGE_PROVIDER=openai');
    expect(text).toContain('OPENAI_API_KEY');
    expect(text).toContain('GEMINI_API_KEY');
  });

  it('writes it once and reports that it did', () => {
    const file = join(dir, 'nested', 'bridge.env');
    expect(ensureSettingsTemplate(file)).toBe(true);
    expect(readEnvFile(file)).toEqual({});
  });

  it.runIf(process.platform !== 'win32')('keeps it readable only by its owner', () => {
    // The API key goes in here, so this file is the more sensitive of the two,
    // not the less. It was created world-readable until a real run showed it.
    const file = join(dir, 'bridge.env');
    ensureSettingsTemplate(file);
    expect(statSync(file).mode & 0o077).toBe(0);
  });

  it("never overwrites an author's own settings", () => {
    const file = join(dir, 'bridge.env');
    writeFileSync(file, 'OPENAI_API_KEY=sk-mine\n');
    expect(ensureSettingsTemplate(file)).toBe(false);
    expect(readEnvFile(file)).toEqual({ OPENAI_API_KEY: 'sk-mine' });
  });
});
