// @vitest-environment node
import {
  checkProviderAuthentication,
  providerAuthCommand,
  type ProviderAuthRunner,
} from '../../tools/ai-bridge/src/cli-launcher';

describe('AI bridge provider launcher', () => {
  it('runs Codex directly on Windows', () => {
    expect(providerAuthCommand('codex', 'win32', 'C:\\Windows\\System32\\cmd.exe')).toEqual({
      command: 'codex.exe',
      args: ['login', 'status'],
    });
  });

  it('runs the Claude .cmd shim through an explicit command processor', () => {
    expect(providerAuthCommand('claude', 'win32', 'C:\\Windows\\System32\\cmd.exe')).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'claude.cmd auth status'],
    });
  });

  it('uses direct executables outside Windows', () => {
    expect(providerAuthCommand('claude', 'linux')).toEqual({ command: 'claude', args: ['auth', 'status'] });
    expect(providerAuthCommand('codex', 'darwin')).toEqual({ command: 'codex', args: ['login', 'status'] });
  });

  it('does not enable shell mode and hides the Windows preflight window', () => {
    const run = vi.fn<ProviderAuthRunner>(() => ({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
      error: undefined,
    }));
    checkProviderAuthentication('claude', run);
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][2]).toEqual({ encoding: 'utf8', windowsHide: true });
    expect(run.mock.calls[0][2]).not.toHaveProperty('shell');
  });
});
