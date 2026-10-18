/**
 * The time a turn may take, not counting the time it spends waiting for the
 * author.
 *
 * A proposal sits in front of the author for as long as they need to read it.
 * A timer that kept running through that would end the turn while its answer
 * was still being decided, so the budget stops when a wait begins and goes on
 * with what was left when it ends. The card has a lifetime of its own, and the
 * limits on single network requests are not touched by this.
 */

/** Counts the waits for the author that are open, and says when the first begins and the last ends. */
export class AuthorWait {
  private open = 0;
  private readonly listeners = new Set<(waiting: boolean) => void>();

  get waiting(): boolean { return this.open > 0; }

  begin(): void {
    this.open += 1;
    if (this.open === 1) this.emit(true);
  }

  end(): void {
    if (this.open === 0) return;
    this.open -= 1;
    if (this.open === 0) this.emit(false);
  }

  watch(listener: (waiting: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(waiting: boolean): void {
    for (const listener of [...this.listeners]) listener(waiting);
  }
}

/**
 * Claude Code cuts a tool call off after `MCP_TOOL_TIMEOUT`, and nothing sent
 * during the call extends that. A budget that stops cannot help there, so the
 * limit itself has to be longer than a card may wait: the card's lifetime, the
 * bridge's grace on top of it, and room for the answer to travel.
 */
const TOOL_TIMEOUT_MARGIN_MS = 60_000;

/** The environment for a Claude Code process whose tool calls may wait for the author. */
export function envForAuthorWait(env: Record<string, string | undefined>, authorWaitTtlMs: number): Record<string, string | undefined> {
  const needed = authorWaitTtlMs + TOOL_TIMEOUT_MARGIN_MS;
  const set = Number(env.MCP_TOOL_TIMEOUT);
  return { ...env, MCP_TOOL_TIMEOUT: String(Number.isFinite(set) && set > needed ? set : needed) };
}

export interface AuthorWaitSource {
  /** Whether a wait is open right now; a budget started in the middle of one starts stopped. */
  isAwaitingAuthor?(): boolean;
  watchAuthorWait?(listener: (waiting: boolean) => void): () => void;
}

export interface TurnBudget {
  /** Ends the budget without spending it. */
  stop(): void;
}

export function startTurnBudget(ms: number, onSpent: () => void, waits?: AuthorWaitSource): TurnBudget {
  let remaining = ms;
  let runningSince = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let over = false;

  const run = () => {
    if (over || timer) return;
    runningSince = Date.now();
    timer = setTimeout(() => {
      timer = null;
      over = true;
      unwatch?.();
      onSpent();
    }, remaining);
  };
  const hold = () => {
    if (over || !timer) return;
    clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, remaining - (Date.now() - runningSince));
  };

  const unwatch = waits?.watchAuthorWait?.(waiting => (waiting ? hold() : run()));
  if (!waits?.isAwaitingAuthor?.()) run();

  return {
    stop() {
      over = true;
      if (timer) clearTimeout(timer);
      timer = null;
      unwatch?.();
    },
  };
}
