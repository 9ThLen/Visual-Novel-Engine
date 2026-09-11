// @vitest-environment node
import { needsManualPairing, offersKeyEntry, studioBridgeView } from '@/lib/ai/studio-bridge-view';
import type { StudioBridgeResult } from '@/lib/ai/studio-bridge';

const report = (
  over: Partial<{ installed: boolean; ready: boolean; running: boolean; url: string; token: string; error: string }> = {},
) => ({ available: true, report: { installed: true, ready: false, running: false, ...over } }) as StudioBridgeResult;

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
    // Half a pairing is not a pairing. A process is there, so it reads as still
    // starting rather than as something to start again.
    expect(studioBridgeView(report({ ready: true, running: true, url: 'ws://127.0.0.1:8787' })).kind).toBe('busy');
    expect(studioBridgeView(report({ ready: true, running: false, token: 't' })).kind).toBe('offer');
  });

  it('waits while the studio is still starting one', () => {
    // The studio starts the bridge as it opens, so the panel can be opened
    // mid-start. A button here would start a second process against a taken port.
    expect(studioBridgeView(report({ running: true }))).toEqual({ kind: 'busy' });
  });

  it('steps aside in a studio that carries no bridge', () => {
    // Built without the package: a supported shape, and the manual pairing form
    // is the way in. An offer to start what is not there can only fail.
    const view = studioBridgeView(report({ installed: false }));
    expect(view).toEqual({ kind: 'absent' });
    expect(needsManualPairing(view)).toBe(true);
  });

  it('takes a key in every state an author can act on', () => {
    // Including a bridge that is up: a key can be wrong rather than missing, and
    // then the bridge runs, pairs, and the model refuses every message. Offering
    // the field only after a failed start left nowhere to correct it.
    expect(offersKeyEntry({ kind: 'paired', url: 'u', token: 't' })).toBe(true);
    expect(offersKeyEntry({ kind: 'offer' })).toBe(true);
    expect(offersKeyEntry({ kind: 'blocked', message: 'no key' })).toBe(true);
    expect(offersKeyEntry({ kind: 'busy' })).toBe(false);
    expect(offersKeyEntry({ kind: 'absent' })).toBe(false);
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
