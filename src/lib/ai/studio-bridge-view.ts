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

  const { ready, url, token, error } = result.report;
  if (ready && url && token) return { kind: 'paired', url, token };
  // Running but not ready is not a state anyone can act on differently: the
  // supervisor waits for readiness before returning, so arriving here means it
  // gave up or never started.
  if (error) return { kind: 'blocked', message: error };
  return { kind: 'offer' };
}

/** Whether the manual URL-and-token form is the author's only way in. */
export function needsManualPairing(view: StudioBridgeView): boolean {
  return view.kind === 'absent';
}
