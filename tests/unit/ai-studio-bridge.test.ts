// @vitest-environment jsdom
import {
  isStudioShell,
  pairingFrom,
  saveStudioBridgeSettings,
  startStudioBridge,
  type StudioBridgeResult,
} from '@/lib/ai/studio-bridge';
import { STUDIO_ORIGINS } from '@/lib/ai/studio-origins';

/**
 * The spy sits where Tauri's IPC does, not where our wrapper is.
 *
 * Mocking `@tauri-apps/api/core` was the first attempt and it proved less: the
 * real module is what runs in the studio, and putting the seam underneath it
 * shows that the command name and arguments survive that layer. It calls
 * `(command, args, options)`, so assertions look at the first two.
 */
const invoke = vi.fn();

function calledWith(index = 0): [string, unknown] {
  const call = invoke.mock.calls[index];
  return [call[0] as string, call[1]];
}

/** Pretends to be the installed studio: the right origin and Tauri's IPC. */
function asStudioShell(origin: string = STUDIO_ORIGINS[0]) {
  Object.defineProperty(window, 'location', { value: { origin }, writable: true });
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke };
}

describe('recognising the installed studio', () => {
  it('needs the studio origin and Tauri present, not either alone', () => {
    // A studio built before these commands existed has the origin and no IPC;
    // a browser has neither. Both must take the manual pairing path.
    for (const origin of STUDIO_ORIGINS) {
      expect(isStudioShell(origin, true)).toBe(true);
      expect(isStudioShell(origin, false)).toBe(false);
    }
    expect(isStudioShell('http://localhost:8081', true)).toBe(false);
    expect(isStudioShell('https://editor.example.com', true)).toBe(false);
  });
});

describe('talking to the supervisor', () => {
  beforeEach(() => {
    invoke.mockReset();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('says so, quietly, when there is nothing to talk to', async () => {
    // A dev server shows the same AI panel. Nothing here may throw there.
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost:8081' }, writable: true });
    await expect(startStudioBridge()).resolves.toEqual({ available: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('carries the pairing details back', async () => {
    asStudioShell();
    invoke.mockResolvedValue({ ready: true, running: true, url: 'ws://127.0.0.1:8787', token: 'a'.repeat(48) });

    const result = await startStudioBridge();
    expect(calledWith()).toEqual(['ai_bridge_start', {}]);
    expect(pairingFrom(result)).toEqual({ url: 'ws://127.0.0.1:8787', token: 'a'.repeat(48) });
  });

  it("carries the bridge's own words back when it refuses", async () => {
    // The supervisor rejects with the message the bridge printed — a missing
    // key, an unprotected settings folder. That message is the diagnosis, and
    // replacing it with one of ours would throw the diagnosis away.
    asStudioShell();
    invoke.mockRejectedValue('OPENAI_API_KEY is not set, so openai has nothing to authenticate with.');

    const result = await startStudioBridge();
    expect(result).toEqual({
      available: true,
      failed: true,
      message: 'OPENAI_API_KEY is not set, so openai has nothing to authenticate with.',
    });
    expect(pairingFrom(result)).toBeNull();
  });

  it('does not offer pairing for a bridge that is running but not ready', async () => {
    asStudioShell();
    invoke.mockResolvedValue({ ready: false, running: true, url: 'ws://127.0.0.1:8787' });
    expect(pairingFrom(await startStudioBridge())).toBeNull();
  });

  it('passes the provider and key as values, and nothing else', async () => {
    asStudioShell();
    invoke.mockResolvedValue({ ready: true, running: true, url: 'ws://127.0.0.1:8787', token: 'b'.repeat(48) });

    await saveStudioBridgeSettings('openai', 'sk-typed-by-the-author');

    expect(calledWith()).toEqual([
      'ai_bridge_save_settings',
      { provider: 'openai', apiKey: 'sk-typed-by-the-author' },
    ]);
  });

  it('treats an unavailable result as unpairable', () => {
    expect(pairingFrom({ available: false } as StudioBridgeResult)).toBeNull();
  });
});
