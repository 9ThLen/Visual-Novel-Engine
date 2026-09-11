/**
 * The origins the installed studio serves its window from.
 *
 * Two independent allowlists decide whether an author can reach the AI bridge,
 * and before this constant existed they disagreed: the bridge's origin policy
 * would have rejected the studio's WebSocket handshake, and the editor's
 * platform check hid the AI tab outright — the second one first, so the symptom
 * was not a connection error but a missing feature with no visible cause.
 *
 * Both now read this list, so they cannot drift apart again.
 *
 * Every value here is one that has been **measured** on a real build, by reading
 * the `Origin` header off an actual WebSocket handshake. Tauri documents
 * `http://tauri.localhost` for Windows and `tauri://localhost` elsewhere, but a
 * documented origin is not a verified one: adding a value nobody has observed
 * either does nothing or widens both allowlists for a string that never appears.
 * Measure first, then add.
 *
 * Measured so far:
 *   Windows 10, WebView2 (Chrome/152 Edg/152) — `http://tauri.localhost`
 */
export const STUDIO_ORIGINS = ['http://tauri.localhost'] as const;

export function isStudioOrigin(origin: string): boolean {
  return (STUDIO_ORIGINS as readonly string[]).includes(origin);
}
