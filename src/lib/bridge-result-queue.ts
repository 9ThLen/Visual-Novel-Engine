/**
 * Answers to calls that waited for the author, kept until the bridge says it
 * has them.
 *
 * An answer is sent once, over a socket that may have dropped a moment before:
 * the author pressed Apply, the change was written, and the bridge never heard.
 * So the answer stays here until it is acknowledged and is sent again when the
 * session comes back — including after a reload, which is why it lives in
 * `sessionStorage` next to the session's id. Only these few small answers are
 * kept; what a read returned can simply be read again.
 */
import type { ToolResult } from './bridge-client';

const MAX_KEPT = 16;

interface Stored { sessionId: string; items: [string, ToolResult][] }

export class BridgeResultQueue {
  private sessionId = '';
  private items = new Map<string, ToolResult>();

  constructor(private readonly storageKey: string) {}

  /**
   * Ties the queue to the session that has just started. Answers left behind
   * for the same session are picked up; those for another are of no use to
   * anyone and are dropped.
   */
  adopt(sessionId: string): void {
    if (sessionId === this.sessionId) return;
    const stored = this.read();
    this.sessionId = sessionId;
    this.items = new Map(stored?.sessionId === sessionId ? stored.items : []);
    this.write();
  }

  add(toolCallId: string, result: ToolResult): void {
    this.items.delete(toolCallId);
    this.items.set(toolCallId, result);
    for (const id of this.items.keys()) {
      if (this.items.size <= MAX_KEPT) break;
      this.items.delete(id);
    }
    this.write();
  }

  remove(toolCallId: string): void {
    if (this.items.delete(toolCallId)) this.write();
  }

  entries(): [string, ToolResult][] {
    return [...this.items];
  }

  clear(): void {
    this.sessionId = '';
    this.items.clear();
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(this.storageKey);
    } catch { /* Nothing was kept there, then. */ }
  }

  private read(): Stored | null {
    try {
      const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(this.storageKey);
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (typeof value !== 'object' || value === null) return null;
      const { sessionId, items } = value as Partial<Stored>;
      if (typeof sessionId !== 'string' || !Array.isArray(items)) return null;
      return {
        sessionId,
        items: items.filter((item): item is [string, ToolResult] => Array.isArray(item)
          && typeof item[0] === 'string' && typeof item[1] === 'object' && item[1] !== null),
      };
    } catch {
      return null;
    }
  }

  private write(): void {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const stored: Stored = { sessionId: this.sessionId, items: [...this.items] };
      sessionStorage.setItem(this.storageKey, JSON.stringify(stored));
    } catch { /* Without storage the queue still covers a reconnect, only not a reload. */ }
  }
}
