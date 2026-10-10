/**
 * The last question before an AI change is written.
 *
 * Applying a change waits more than once on the way to the store — for the
 * author's draft to be saved, for a rollback snapshot. In any of those waits
 * the request behind the change can stop being valid: the bridge withdraws it,
 * its card runs out of time, the author blocks the capability, the editor is
 * closed and the session with it. A check made before the waits cannot see
 * that, so the adapters ask again in the very step that writes, with nothing
 * awaited in between. Once the write has happened it stands, whatever arrives
 * afterwards.
 */
export type WriteRefusal = 'CANCELLED' | 'EXPIRED' | 'PERMISSION_DENIED' | 'SESSION_ENDED';

/** Returns why the change must not be written, or null to let it through. */
export type WriteGate = () => WriteRefusal | null;

export function isWriteRefusal(code: string): code is WriteRefusal {
  return code === 'CANCELLED' || code === 'EXPIRED' || code === 'PERMISSION_DENIED' || code === 'SESSION_ENDED';
}

const REFUSAL_MESSAGE: Record<WriteRefusal, string> = {
  CANCELLED: 'The request for this change was withdrawn',
  EXPIRED: 'The request for this change ran out of time',
  PERMISSION_DENIED: 'This kind of change is blocked',
  SESSION_ENDED: 'The session this change was asked for in has ended',
};

export function writeRefusalMessage(refusal: WriteRefusal): string {
  return REFUSAL_MESSAGE[refusal];
}
