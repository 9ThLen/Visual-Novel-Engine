import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CODEX_HARDENING_REASON = 'CODEX_HARDENING_UNSUPPORTED' as const;

export const CODEX_DISABLED_FEATURES = [
  'apps',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'goals',
  'hooks',
  'image_generation',
  'in_app_browser',
  'memories',
  'multi_agent',
  'plugin_sharing',
  'remote_plugin',
  'shell_tool',
  'skill_mcp_dependency_install',
] as const;

export interface CodexHardeningCapability {
  supported: false;
  reason: typeof CODEX_HARDENING_REASON;
  message: string;
}

/**
 * Codex CLI 0.134.0 has no invocation-level disable-all-tools switch or
 * model-tool allowlist. Feature flags and a read-only OS sandbox reduce risk,
 * but cannot prove the product invariant that only VNE app tools are visible.
 *
 * Keep this gate fail-closed until a concrete, tested CLI capability is added
 * to both this check and buildCodexExecArgs().
 */
export function getCodexHardeningCapability(): CodexHardeningCapability {
  return {
    supported: false,
    reason: CODEX_HARDENING_REASON,
    message: 'This Codex CLI cannot prove a zero-data-access model tool surface. Use the Claude provider.',
  };
}

export function codexConfigOverrideArgs(): string[] {
  return CODEX_DISABLED_FEATURES.flatMap(feature => ['-c', `features.${feature}=false`]);
}

export function buildCodexExecArgs(options: {
  workspace: string;
  schemaPath: string;
  threadId?: string | null;
}): string[] {
  const common = [
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--json',
    '--sandbox',
    'read-only',
    '--cd',
    options.workspace,
    '--skip-git-repo-check',
    ...codexConfigOverrideArgs(),
    '--output-schema',
    options.schemaPath,
  ];
  return options.threadId
    ? [...common, 'resume', options.threadId, '-']
    : [...common, '-'];
}

export function buildCodexFeatureProbeArgs(): string[] {
  return [...codexConfigOverrideArgs(), 'features', 'list'];
}

const SAFE_ENVIRONMENT_KEYS = new Set([
  'COMSPEC',
  'HOME',
  'LANG',
  'LC_ALL',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
]);

export function buildSafeCodexEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env,
  extra: Readonly<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv {
  const nodeEnv = source.NODE_ENV;
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: nodeEnv === 'development' || nodeEnv === 'test' ? nodeEnv : 'production',
  };
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && SAFE_ENVIRONMENT_KEYS.has(key.toUpperCase())) {
      environment[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

export function buildCodexFeatureProbeEnvironment(
  codexHome: string,
  source: Readonly<Record<string, string | undefined>> = process.env,
): NodeJS.ProcessEnv {
  return buildSafeCodexEnvironment(source, { CODEX_HOME: codexHome });
}

export function createCodexWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'vne-codex-'));
}

export function createCodexFeatureProbeHome(): string {
  return mkdtempSync(join(tmpdir(), 'vne-codex-home-'));
}

export function removeCodexTemporaryDirectory(path: string | null | undefined): void {
  if (!path) return;
  rmSync(path, { recursive: true, force: true });
}
