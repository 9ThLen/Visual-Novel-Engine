// @vitest-environment node
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative } from 'node:path';
import {
  buildCodexExecArgs,
  buildCodexFeatureProbeEnvironment,
  buildCodexFeatureProbeArgs,
  buildSafeCodexEnvironment,
  CODEX_DISABLED_FEATURES,
  CODEX_HARDENING_REASON,
  createCodexFeatureProbeHome,
  createCodexWorkspace,
  getCodexHardeningCapability,
  removeCodexTemporaryDirectory,
} from '../../tools/ai-bridge/src/codex-launch-policy';

describe('Codex launch policy', () => {
  it('fails closed when the CLI cannot prove a zero-data-access tool surface', () => {
    expect(getCodexHardeningCapability()).toEqual(expect.objectContaining({
      supported: false,
      reason: CODEX_HARDENING_REASON,
    }));
  });

  it('uses the same mandatory hardening prefix for fresh and resumed turns', () => {
    const options = { workspace: 'C:\\temp\\vne-codex', schemaPath: 'schema.json' };
    const fresh = buildCodexExecArgs(options);
    const resumed = buildCodexExecArgs({ ...options, threadId: 'thread-1' });

    for (const args of [fresh, resumed]) {
      expect(args).toContain('--ignore-user-config');
      expect(args).toContain('--ignore-rules');
      expect(args).toContain('read-only');
      expect(args).toContain(options.workspace);
      for (const feature of CODEX_DISABLED_FEATURES) {
        expect(args).toContain(`features.${feature}=false`);
      }
    }
    expect(resumed.indexOf('--ignore-user-config')).toBeLessThan(resumed.indexOf('resume'));
    expect(resumed.indexOf('--cd')).toBeLessThan(resumed.indexOf('resume'));
    expect(resumed.slice(resumed.indexOf('resume'))).toEqual(['resume', 'thread-1', '-']);
  });

  it('builds the feature probe without the unsupported ignore-user-config syntax', () => {
    const args = buildCodexFeatureProbeArgs();
    const environment = buildCodexFeatureProbeEnvironment('C:\\isolated-codex-home', {
      PATH: 'safe-path',
      OPENAI_API_KEY: 'secret',
    });
    expect(args.slice(-2)).toEqual(['features', 'list']);
    expect(args).not.toContain('--ignore-user-config');
    expect(args).not.toContain('--ignore-rules');
    expect(environment).toEqual({
      NODE_ENV: 'production',
      PATH: 'safe-path',
      CODEX_HOME: 'C:\\isolated-codex-home',
    });
  });

  it('does not inherit credentials or arbitrary token and secret values', () => {
    const environment = buildSafeCodexEnvironment({
      PATH: 'safe-path',
      TEMP: 'safe-temp',
      AI_BRIDGE_TOKEN: 'bridge-secret',
      OPENAI_API_KEY: 'openai-secret',
      ANTHROPIC_API_KEY: 'anthropic-secret',
      GITHUB_TOKEN: 'github-secret',
      CUSTOM_SECRET: 'custom-secret',
    });
    expect(environment).toEqual({ NODE_ENV: 'production', PATH: 'safe-path', TEMP: 'safe-temp' });
  });

  it('creates isolated temporary directories and removes them', () => {
    const workspace = createCodexWorkspace();
    const probeHome = createCodexFeatureProbeHome();
    try {
      expect(relative(tmpdir(), workspace)).not.toMatch(/^\.\./);
      expect(relative(tmpdir(), probeHome)).not.toMatch(/^\.\./);
      expect(existsSync(workspace)).toBe(true);
      expect(existsSync(probeHome)).toBe(true);
    } finally {
      removeCodexTemporaryDirectory(workspace);
      removeCodexTemporaryDirectory(probeHome);
    }
    expect(existsSync(workspace)).toBe(false);
    expect(existsSync(probeHome)).toBe(false);
  });
});
