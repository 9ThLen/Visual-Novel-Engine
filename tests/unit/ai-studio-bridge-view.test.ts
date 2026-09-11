// @vitest-environment node
import { needsManualPairing, studioBridgeView } from '@/lib/ai/studio-bridge-view';
import type { StudioBridgeResult } from '@/lib/ai/studio-bridge';

const report = (over: Partial<{ ready: boolean; running: boolean; url: string; token: string; error: string }> = {}) =>
  ({ available: true, report: { ready: false, running: false, ...over } }) as StudioBridgeResult;

describe('what the panel offers about the studio bridge', () => {
  it('offers nothing before anything has been asked', () => {
    expect(studioBridgeView(null)).toEqual({ kind: 'absent' });
  });

  it('offers nothing where there is no supervisor to ask', () => {
    // A dev server and a browser both land here, and both keep the manual
    // pairing form they have always had.
    const view = studioBridgeView({ available: false });
    expect(view).toEqual({ kind: 'absent' });
    expect(needsManualPairing(view)).toBe(true);
  });

  it('offers to start one when there is a supervisor and no bridge', () => {
    expect(studioBridgeView(report())).toEqual({ kind: 'offer' });
    expect(needsManualPairing({ kind: 'offer' })).toBe(false);
  });

  it('hands over the pairing details once it is ready', () => {
    expect(studioBridgeView(report({ ready: true, running: true, url: 'ws://127.0.0.1:8787', token: 't'.repeat(48) })))
      .toEqual({ kind: 'paired', url: 'ws://127.0.0.1:8787', token: 't'.repeat(48) });
  });

  it('does not call it paired without both halves', () => {
    expect(studioBridgeView(report({ ready: true, running: true, url: 'ws://127.0.0.1:8787' })).kind).toBe('offer');
    expect(studioBridgeView(report({ ready: true, running: true, token: 't' })).kind).toBe('offer');
  });

  it("shows the bridge's own words when it refuses", () => {
    // No attempt to classify why. The bridge refuses for a missing key, for a
    // settings folder it could not protect, and for anything else it finds;
    // matching English to decide what to offer breaks on the first reword.
    const message = 'OPENAI_API_KEY is not set, so openai has nothing to authenticate with.';
    expect(studioBridgeView({ available: true, failed: true, message }))
      .toEqual({ kind: 'blocked', message });
    expect(studioBridgeView(report({ error: 'the folder could not be restricted' })))
      .toEqual({ kind: 'blocked', message: 'the folder could not be restricted' });
  });

  it('says it is busy over anything else, so a second click cannot race', () => {
    expect(studioBridgeView(report({ ready: true, url: 'u', token: 't' }), true)).toEqual({ kind: 'busy' });
    expect(studioBridgeView(null, true)).toEqual({ kind: 'busy' });
  });
});
