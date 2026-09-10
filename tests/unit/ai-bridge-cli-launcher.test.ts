// @vitest-environment node
import {
  checkProviderAuthentication,
  missingProviderKey,
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

describe('the API key a provider needs at startup', () => {
  // claude and codex are stopped at startup when their CLI is missing, and the
  // author reads why in the window they are looking at. openai and gemini used
  // to start with no key and fail on the first message instead, which reaches
  // the editor as a generic connection error.
  it('names the variable that is missing', () => {
    expect(missingProviderKey('openai', {})).toBe('OPENAI_API_KEY');
    expect(missingProviderKey('gemini', {})).toBe('GEMINI_API_KEY');
  });

  it('treats whitespace as missing, because a blank line in a settings file is', () => {
    expect(missingProviderKey('openai', { OPENAI_API_KEY: '   ' })).toBe('OPENAI_API_KEY');
    expect(missingProviderKey('gemini', { GEMINI_API_KEY: '\t' })).toBe('GEMINI_API_KEY');
  });

  it('is satisfied by a key', () => {
    expect(missingProviderKey('openai', { OPENAI_API_KEY: 'sk-test' })).toBeNull();
    expect(missingProviderKey('gemini', { GEMINI_API_KEY: 'g-test' })).toBeNull();
  });

  it('leaves the CLI providers to their own check', () => {
    expect(missingProviderKey('claude', {})).toBeNull();
    expect(missingProviderKey('codex', {})).toBeNull();
  });
});
