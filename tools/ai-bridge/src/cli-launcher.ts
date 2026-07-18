import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import type { BridgeProvider } from '../../../lib/bridge-protocol';

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
  if (provider === 'openai') {
    throw new Error('OpenAI API authentication does not use a CLI');
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
  if (provider === 'openai') {
    return { pid: 0, output: [], stdout: '', stderr: '', status: 0, signal: null };
  }
  const command = providerAuthCommand(provider);
  return run(command.command, command.args, {
    encoding: 'utf8',
    windowsHide: true,
  });
}
