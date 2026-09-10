import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import type { BridgeProvider } from '../../../src/lib/bridge-protocol';

export interface ProviderAuthCommand {
  command: string;
  args: string[];
}

export type ProviderAuthRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

export function providerAuthCommand(
  provider: BridgeProvider,
  platform: NodeJS.Platform = process.platform,
  comSpec = process.env.ComSpec,
): ProviderAuthCommand {
  if (provider === 'openai' || provider === 'gemini') {
    throw new Error(`${provider} authentication does not use a CLI`);
  }
  if (platform !== 'win32') {
    return provider === 'codex'
      ? { command: 'codex', args: ['login', 'status'] }
      : { command: 'claude', args: ['auth', 'status'] };
  }

  if (provider === 'codex') {
    return { command: 'codex.exe', args: ['login', 'status'] };
  }

  return {
    command: comSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', 'claude.cmd auth status'],
  };
}

export function checkProviderAuthentication(
  provider: BridgeProvider,
  run: ProviderAuthRunner = spawnSync,
): SpawnSyncReturns<string> {
  if (provider === 'openai' || provider === 'gemini') {
    return { pid: 0, output: [], stdout: '', stderr: '', status: 0, signal: null };
  }
  const command = providerAuthCommand(provider);
  return run(command.command, command.args, {
    encoding: 'utf8',
    windowsHide: true,
  });
}

/**
 * The API key a provider needs and does not have.
 *
 * `claude` and `codex` are stopped at startup when their CLI is missing or
 * signed out, and the author reads why in the window they are looking at.
 * `openai` and `gemini` had no equivalent: the bridge started happily with no
 * key and failed on the first message instead, which reaches the editor as a
 * generic connection error long after the window that could have explained it.
 *
 * Returns the variable's name so the message can name it, or `null` when the
 * provider is satisfied.
 */
export function missingProviderKey(
  provider: BridgeProvider,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  if (provider === 'openai') return env.OPENAI_API_KEY?.trim() ? null : 'OPENAI_API_KEY';
  if (provider === 'gemini') return env.GEMINI_API_KEY?.trim() ? null : 'GEMINI_API_KEY';
  return null;
}
