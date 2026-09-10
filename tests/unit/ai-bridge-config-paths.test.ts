// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BRIDGE_HOME_ENV,
  bridgeConfigFile,
  bridgeHomeDir,
  bridgeTokenFile,
} from '../../tools/ai-bridge/src/config-paths';
import { applyEnvDefaults, parseEnvFile, readEnvFile } from '../../tools/ai-bridge/src/config-store';

describe('bridge home directory', () => {
  it('uses the per-user local app data directory on Windows', () => {
    expect(bridgeHomeDir({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' },
      home: 'C:\\Users\\ada',
    })).toBe(join('C:\\Users\\ada\\AppData\\Local', 'VisualNovelEngine', 'Bridge'));
  });

  it('falls back to the profile when Windows does not set LOCALAPPDATA', () => {
    expect(bridgeHomeDir({ platform: 'win32', env: {}, home: '/profile' }))
      .toBe(join('/profile', 'AppData', 'Local', 'VisualNovelEngine', 'Bridge'));
  });

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
    expect(bridgeConfigFile('/home')).toBe(join('/home', 'bridge.env'));
    expect(bridgeTokenFile('/home')).toBe(join('/home', 'token'));
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
