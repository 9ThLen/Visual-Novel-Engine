// @vitest-environment node
import { PACKAGED_LAUNCHER, bridgeLaunchInstruction } from '@/lib/ai/bridge-launch';
import { STUDIO_ORIGINS } from '@/lib/ai/studio-origins';

const base = { provider: 'openai' as const, imageProvider: 'auto', url: 'ws://127.0.0.1:8787' };

describe('how the panel tells an author to start a bridge', () => {
  it('gives a checkout the command that works in a checkout', () => {
    const instruction = bridgeLaunchInstruction({ ...base, origin: 'http://localhost:8081' });
    expect(instruction.kind).toBe('checkout');
    expect(instruction.command).toBe('pnpm ai-bridge --provider openai --image-provider auto --origin http://localhost:8081');
  });

  it('gives the installed studio the launcher, not a package manager it does not have', () => {
    // `pnpm ai-bridge` was the only instruction the panel ever gave. In the
    // installed studio it names a package manager that is not installed and a
    // repository that was never cloned, so the feature reads as broken rather
    // than as unconfigured.
    const instruction = bridgeLaunchInstruction({ ...base, origin: 'http://tauri.localhost' });
    expect(instruction.kind).toBe('packaged');
    expect(instruction.command).toBe(`"${PACKAGED_LAUNCHER}" --provider openai --image-provider auto`);
    expect(instruction.command).not.toContain('pnpm');
  });

  it('recognises every origin the studio is served from', () => {
    for (const origin of STUDIO_ORIGINS) {
      expect(bridgeLaunchInstruction({ ...base, origin }).kind).toBe('packaged');
    }
  });

  it('does not make the studio retype an --origin it already allows', () => {
    // The bridge's defaults carry this origin. A flag the author has to copy
    // correctly is one more way for the first attempt to fail.
    const instruction = bridgeLaunchInstruction({ ...base, origin: 'http://tauri.localhost' });
    expect(instruction.command).not.toContain('--origin');
  });

  it('starts no model for an author who wants the bridge for an agent of their own', () => {
    const instruction = bridgeLaunchInstruction({ ...base, provider: 'none', origin: 'http://localhost:8081' });

    expect(instruction.command).toBe('pnpm ai-bridge --provider none --mcp --origin http://localhost:8081');
    // The tools that draw are the chat's; there is no image backend to name.
    expect(instruction.command).not.toContain('--image-provider');
    expect(bridgeLaunchInstruction({ ...base, provider: 'none', origin: 'http://tauri.localhost', url: 'ws://127.0.0.1:9100' }).command)
      .toBe(`"${PACKAGED_LAUNCHER}" --provider none --mcp --port 9100`);
  });

  it('offers a bridge with chat to an external agent too, when the author has let one in', () => {
    expect(bridgeLaunchInstruction({ ...base, mcp: true, origin: 'http://localhost:8081' }).command)
      .toBe('pnpm ai-bridge --provider openai --image-provider auto --mcp --origin http://localhost:8081');
    expect(bridgeLaunchInstruction({ ...base, origin: 'http://localhost:8081' }).command).not.toContain('--mcp');
    // Said once, not twice.
    expect(bridgeLaunchInstruction({ ...base, provider: 'none', mcp: true, origin: 'http://localhost:8081' }).command.match(/--mcp/g)).toHaveLength(1);
  });

  it('carries a non-default port across, and stays quiet about the default', () => {
    expect(bridgeLaunchInstruction({ ...base, origin: 'http://tauri.localhost', url: 'ws://127.0.0.1:9100' }).command)
      .toContain('--port 9100');
    expect(bridgeLaunchInstruction({ ...base, origin: 'http://tauri.localhost', url: 'ws://127.0.0.1:8787' }).command)
      .not.toContain('--port');
  });

  it('ignores a URL it cannot parse rather than emitting a broken flag', () => {
    expect(bridgeLaunchInstruction({ ...base, origin: 'http://tauri.localhost', url: 'not a url' }).command)
      .not.toContain('--port');
  });

  it('keeps the Codex opt-in attached to Codex', () => {
    expect(bridgeLaunchInstruction({ ...base, provider: 'codex', origin: 'http://localhost:8081' }).command)
      .toContain('--enable-codex-beta');
    expect(bridgeLaunchInstruction({ ...base, origin: 'http://localhost:8081' }).command)
      .not.toContain('--enable-codex-beta');
  });
});
