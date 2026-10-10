/**
 * What stands between an agent outside the app and the editor the author has
 * open.
 *
 * The agent talks to the bridge over MCP; the story lives in a browser tab.
 * Every call is checked here before it is passed on: that a tab is on the
 * line, that the agent is still talking about the editor it thinks it is
 * (`binding`), that it is not calling faster than a person's tool should, and
 * — for a proposal — that nothing else is in front of the author already.
 *
 * A proposal never waits inside the call that makes it. An MCP client gives a
 * tool a minute, an author reading a diff takes longer, so the call returns at
 * once with `pending` and the agent asks for the outcome afterwards. What it is
 * told then is kept here, apart from the session: the session ends when the
 * author moves to another story, and the agent still has to be able to read
 * that its proposal was cancelled by that.
 */
import { AUTHOR_WAIT_TTL_MS, getBridgeTool } from '../../../src/lib/ai/bridge-tools';
import { BridgeToolError } from './provider';

/** Calls an agent may make in any sixty seconds; the chat's per-turn limit does not apply to it. */
export const EXTERNAL_CALLS_PER_MINUTE = 120;
const RATE_WINDOW_MS = 60_000;
/** How long the outcome of a proposal can still be read after it is known. */
export const PROPOSAL_KEPT_MS = 15 * 60_000;
const PROPOSALS_KEPT = 64;
export const MAX_STATUS_WAIT_SECONDS = 30;

export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'expired' | 'cancelled' | 'failed' | 'unknown';

/** How a proposal ended, as the bridge learned it. */
export interface ProposalOutcome {
  status: Exclude<ProposalStatus, 'pending'>;
  /** The error code for `failed`; who or what ended it otherwise. */
  reason?: string;
  /** The narrower reason the app gave, when it gave one. */
  detail?: string;
  message?: string;
}

export interface ProposalView {
  proposalId: string;
  status: ProposalStatus;
  reason?: string;
  detail?: string;
  message?: string;
  /** While pending: how long the author still has. */
  expiresInSeconds?: number;
  hint?: string;
}

/** The editor session a tab holds open, as much of it as the gate needs. */
export interface EditorSessionView {
  binding: string;
  storyId?: string;
  /** The tab is on the line right now. */
  connected: boolean;
  chatTurnRunning: boolean;
  /** A card is in front of the author, whoever put it there. */
  interactionPending: boolean;
}

/** The gate's way to the tab. The server is the only thing that implements it. */
export interface EditorPort {
  session(): EditorSessionView | null;
  /** Sends a read to the tab and resolves with what the tab answered. */
  read(toolName: string, input: unknown): Promise<unknown>;
  /** Puts a proposal in front of the author and returns its id; how it ends arrives through `settle`. */
  propose(toolName: string, input: unknown, ttlMs: number): string;
  /** Takes a proposal back from the author. */
  withdraw(proposalId: string, reason: string): void;
}

export interface ExternalAgentGateOptions {
  editor: EditorPort;
  ttlMs?: number;
  now?: () => number;
}

interface ProposalRecord extends ProposalView {
  binding: string;
  requestId?: string;
  expiresAt: number;
  settledAt?: number;
  waiters: Set<() => void>;
}

const REREAD_HINT = 'Read the current state again before proposing anything else.';

function refuse(errorCode: string, message: string, reason: string, more: Record<string, unknown> = {}): never {
  throw new BridgeToolError(errorCode, message, { reason, ...more });
}

export class ExternalAgentGate {
  private readonly editor: EditorPort;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly proposals = new Map<string, ProposalRecord>();
  private calls: number[] = [];

  constructor(options: ExternalAgentGateOptions) {
    this.editor = options.editor;
    this.ttlMs = options.ttlMs ?? AUTHOR_WAIT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Counts one call against the agent's own limit. The chat's turn is neither counted nor interrupted. */
  admit(): void {
    const now = this.now();
    this.calls = this.calls.filter(at => at > now - RATE_WINDOW_MS);
    if (this.calls.length >= EXTERNAL_CALLS_PER_MINUTE) {
      refuse('PROVIDER_UNAVAILABLE', `More than ${EXTERNAL_CALLS_PER_MINUTE} calls in a minute`, 'RATE_LIMITED', {
        retryAfterSeconds: Math.max(1, Math.ceil((this.calls[0] + RATE_WINDOW_MS - now) / 1000)),
      });
    }
    this.calls.push(now);
  }

  /**
   * Where the author is. The one call that needs no `binding`, because it is
   * the one that hands it out.
   */
  async editorContext(input: unknown): Promise<Record<string, unknown>> {
    const session = this.connectedSession();
    const answer = await this.editor.read('get_editor_context', this.validInput('get_editor_context', input));
    const fields = typeof answer === 'object' && answer !== null ? answer as Record<string, unknown> : { context: answer };
    return { binding: session.binding, ...(session.storyId ? { storyId: session.storyId } : {}), ...fields };
  }

  async read(toolName: string, binding: string, input: unknown): Promise<unknown> {
    this.sessionFor(binding);
    return this.editor.read(toolName, this.validInput(toolName, input));
  }

  /**
   * Puts a proposal in front of the author and answers at once. A repeat with
   * the same `requestId` is the same proposal: an agent that did not hear the
   * first answer must be able to ask again without the author seeing two cards.
   */
  propose(toolName: string, binding: string, requestId: string | undefined, input: unknown): ProposalView {
    this.prune();
    if (requestId) {
      for (const known of this.proposals.values()) {
        if (known.requestId === requestId && known.binding === binding) return this.view(known);
      }
    }
    const session = this.sessionFor(binding);
    const valid = this.validInput(toolName, input);
    if (getBridgeTool(toolName)?.awaitsAuthor !== true) {
      refuse('VALIDATION_FAILED', `${toolName} does not propose anything`, 'NOT_A_PROPOSAL');
    }
    // One interaction at a time, and the chat's turn counts as one.
    if (session.chatTurnRunning) {
      refuse('PROVIDER_UNAVAILABLE', 'The assistant in the editor is in the middle of a turn', 'CHAT_TURN_RUNNING');
    }
    if (session.interactionPending) {
      refuse('PROVIDER_UNAVAILABLE', 'Another proposal is waiting for the author', 'INTERACTION_PENDING');
    }
    const proposalId = this.editor.propose(toolName, valid, this.ttlMs);
    const record: ProposalRecord = {
      proposalId,
      status: 'pending',
      binding,
      ...(requestId ? { requestId } : {}),
      expiresAt: this.now() + this.ttlMs,
      waiters: new Set(),
    };
    this.proposals.set(proposalId, record);
    return this.view(record);
  }

  /** How a proposal stands, waiting up to `waitSeconds` for the author if it is still pending. */
  async proposalStatus(proposalId: string, binding: string, waitSeconds = 0): Promise<ProposalView> {
    const record = this.proposalFor(proposalId, binding);
    const waitMs = Math.min(Math.max(waitSeconds, 0), MAX_STATUS_WAIT_SECONDS) * 1000;
    if (record.status === 'pending' && waitMs > 0) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); record.waiters.delete(done); resolve(); };
        const timer = setTimeout(done, waitMs);
        // An agent waiting for the author must not be what keeps the bridge from stopping.
        (timer as { unref?: () => void }).unref?.();
        record.waiters.add(done);
      });
    }
    return this.view(record);
  }

  /** Takes a pending proposal back. One that has already ended is answered as it ended. */
  cancelProposal(proposalId: string, binding: string): ProposalView {
    const record = this.proposalFor(proposalId, binding);
    if (record.status === 'pending') {
      this.editor.withdraw(proposalId, 'CANCELLED_BY_AGENT');
      // The server settles it on the way; this covers one it no longer knew.
      if (record.status === 'pending') this.settle(proposalId, { status: 'cancelled', reason: 'CANCELLED_BY_AGENT' });
    }
    return this.view(record);
  }

  /**
   * The server's word on how a proposal ended. It may come twice: a status the
   * bridge had to settle alone gives way to what the app reports afterwards,
   * and which of the two stands is the server's decision, not the gate's.
   */
  settle(proposalId: string, outcome: ProposalOutcome): void {
    const record = this.proposals.get(proposalId);
    if (!record) return;
    record.status = outcome.status;
    record.reason = outcome.reason;
    record.detail = outcome.detail;
    record.message = outcome.message;
    record.settledAt ??= this.now();
    for (const wake of [...record.waiters]) wake();
  }

  private connectedSession(): EditorSessionView {
    const session = this.editor.session();
    if (!session?.connected) {
      refuse('PROVIDER_UNAVAILABLE', 'No editor is connected to the bridge. The author has to open the story and its AI panel.', 'EDITOR_NOT_CONNECTED');
    }
    return session;
  }

  private sessionFor(binding: string): EditorSessionView {
    const session = this.connectedSession();
    if (session.binding !== binding) {
      refuse('VALIDATION_FAILED', 'The editor this binding was given for is no longer the one that is open', 'BINDING_STALE', {
        hint: 'Call get_editor_context again and use the binding it returns.',
      });
    }
    return session;
  }

  /**
   * A proposal answers to the binding it was made under, not to the one that is
   * current: after the author moves to another story the agent must still be
   * able to read that the proposal was cancelled.
   */
  private proposalFor(proposalId: string, binding: string): ProposalRecord {
    this.prune();
    const record = this.proposals.get(proposalId);
    if (!record) {
      refuse('VALIDATION_FAILED', 'No such proposal. An outcome is kept for fifteen minutes.', 'PROPOSAL_NOT_FOUND');
    }
    if (record.binding !== binding) {
      refuse('VALIDATION_FAILED', 'This proposal was made under another binding', 'BINDING_MISMATCH', {
        hint: 'Pass the binding the proposal was made with.',
      });
    }
    return record;
  }

  private validInput(toolName: string, input: unknown): unknown {
    const definition = getBridgeTool(toolName);
    if (!definition?.external) refuse('VALIDATION_FAILED', `Not offered to an external agent: ${toolName}`, 'TOOL_NOT_EXTERNAL');
    const parsed = definition.inputSchema.safeParse(input);
    if (!parsed.success) {
      refuse('VALIDATION_FAILED', `Invalid input for tool: ${toolName}`, 'INVALID_INPUT', {
        issues: parsed.error.issues.map(issue => ({ path: issue.path, code: issue.code, message: issue.message })),
      });
    }
    return parsed.data;
  }

  private view(record: ProposalRecord): ProposalView {
    const pending = record.status === 'pending';
    return {
      proposalId: record.proposalId,
      status: record.status,
      ...(record.reason ? { reason: record.reason } : {}),
      ...(record.detail ? { detail: record.detail } : {}),
      ...(record.message ? { message: record.message } : {}),
      ...(pending ? { expiresInSeconds: Math.max(0, Math.ceil((record.expiresAt - this.now()) / 1000)) } : {}),
      ...(!pending && record.status !== 'applied' ? { hint: REREAD_HINT } : {}),
    };
  }

  private prune(): void {
    const cutoff = this.now() - PROPOSAL_KEPT_MS;
    for (const [id, record] of this.proposals) {
      if (record.settledAt !== undefined && record.settledAt <= cutoff) this.proposals.delete(id);
    }
    for (const [id, record] of this.proposals) {
      if (this.proposals.size <= PROPOSALS_KEPT) break;
      if (record.settledAt !== undefined) this.proposals.delete(id);
    }
  }
}
