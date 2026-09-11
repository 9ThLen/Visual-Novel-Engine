import type { StudioBridgeResult } from '@/lib/ai/studio-bridge';

/**
 * What the AI panel should offer about the bridge the studio carries.
 *
 * A pure decision, kept out of the component because it is the part that can be
 * wrong: which of these an author sees decides whether an unconfigured feature
 * reads as unconfigured or as broken.
 *
 * There is deliberately no attempt to classify *why* a start failed. The bridge
 * refuses for a missing API key, for a settings folder it could not protect, and
 * for anything else it finds; its message is the diagnosis and is shown
 * verbatim. Matching English to decide what to offer would break on the first
 * message anyone reworded — so the key form is offered whenever the bridge is
 * not running, because typing a key is the one action available and doing it
 * when the key was not the problem costs nothing.
 */
export type StudioBridgeView =
  | { kind: 'absent' }
  | { kind: 'busy' }
  | { kind: 'offer' }
  | { kind: 'paired'; url: string; token: string }
  | { kind: 'blocked'; message: string };

export function studioBridgeView(
  result: StudioBridgeResult | null,
  busy = false,
): StudioBridgeView {
  if (busy) return { kind: 'busy' };
  // Nothing asked yet, or nothing to ask: a dev server and a browser both land
  // here, and both keep the manual pairing form they have always had.
  if (result === null || !result.available) return { kind: 'absent' };
  if ('failed' in result) return { kind: 'blocked', message: result.message };

  const { installed, running, ready, url, token, error } = result.report;
  // A studio built without the bridge package is a supported shape: it pairs
  // with a bridge the author runs. Offering to start one that is not there would
  // replace that path with a button whose only outcome is a failure.
  if (!installed && !running) return { kind: 'absent' };
  if (ready && url && token) return { kind: 'paired', url, token };
  // Started, not finished starting. The studio begins this as it opens, so an
  // author can reach the panel while it is still happening.
  if (running) return { kind: 'busy' };
  // Not running, and it said why: a missing key, a settings folder it could not
  // protect, whatever it found. Its own words.
  if (error) return { kind: 'blocked', message: error };
  return { kind: 'offer' };
}

/** Whether the manual URL-and-token form is the author's only way in. */
export function needsManualPairing(view: StudioBridgeView): boolean {
  return view.kind === 'absent';
}

/**
 * Whether the author can type an API key right now.
 *
 * Every state but "nothing to talk to" and "mid-start", including a bridge that
 * is running and paired. That last one is the reported failure: a key can be
 * non-empty, accepted by the bridge at startup and still rejected by the
 * provider on the first message, and the field that replaces it only appeared
 * when the *start* had failed. An author with a mistyped key had a working
 * bridge, a model that refused everything, and nowhere to correct it.
 */
export function offersKeyEntry(view: StudioBridgeView): boolean {
  return view.kind === 'offer' || view.kind === 'blocked' || view.kind === 'paired';
}
