// @vitest-environment node
import { powershellEnv } from '../../tools/ai-bridge/src/powershell-env';
import { protectSecret, revealSecret } from '../../tools/ai-bridge/src/secret-store';

it('removes inherited module paths case-insensitively without changing the parent', () => {
  const parent: NodeJS.ProcessEnv = { NODE_ENV: 'test', PSModulePath: 'pwsh/modules', psmodulepath: 'other', PATH: 'bin', LOCALAPPDATA: 'profile' };
  expect(powershellEnv(parent)).toEqual({ NODE_ENV: 'test', PATH: 'bin', LOCALAPPDATA: 'profile' });
  expect(parent.PSModulePath).toBe('pwsh/modules');
});

it.skipIf(process.platform !== 'win32')('round-trips through native DPAPI despite an incompatible inherited module path', () => {
  vi.stubEnv('PSModulePath', 'C:\\nonexistent-review-modules');
  try {
    const secret = protectSecret('disposable-regression-value');
    expect(secret.protection).toBe('dpapi');
    expect(revealSecret(secret)).toBe('disposable-regression-value');
  } finally {
    vi.unstubAllEnvs();
  }
});
