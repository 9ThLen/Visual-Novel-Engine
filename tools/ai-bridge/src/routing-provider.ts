import {
  modelToolErrorValue,
  type AgentAttachment,
  type AgentEvent,
  type AgentProvider,
  type AgentUserInput,
  type PortableTranscriptEntry,
  ProviderFailure,
  type ProviderFailureReason,
  type ToolInvoker,
} from './provider';

type ProviderSlot = 'primary' | 'fallback';
type ProviderBuilder = (tools: ToolInvoker) => AgentProvider;

export interface RoutingProviderOptions {
  bridge: ToolInvoker;
  primary: ProviderBuilder;
  fallback: ProviderBuilder;
}

interface TurnAttempt {
  slot: ProviderSlot;
  entries: PortableTranscriptEntry[];
  unsafeToReplay: boolean;
}

const FALLBACK_FAILURES = new Set<ProviderFailureReason>([
  'OPENAI_RATE_LIMITED',
  'OPENAI_MODEL_UNAVAILABLE',
  'OPENAI_RESPONSE_INCOMPLETE',
  'OPENAI_STREAM_INCOMPLETE',
  'OPENAI_API_FAILED',
  'GEMINI_RATE_LIMITED',
  'GEMINI_MODEL_UNAVAILABLE',
  'GEMINI_RESPONSE_INCOMPLETE',
  'GEMINI_STREAM_INCOMPLETE',
  'GEMINI_API_FAILED',
]);

/**
 * Fail-closed provider routing. It switches once, and only before the primary
 * has emitted text or announced/invoked a tool call.
 */
export class RoutingProvider implements AgentProvider {
  private readonly primary: AgentProvider;
  private readonly fallback: AgentProvider;
  private active: ProviderSlot = 'primary';
  private current: TurnAttempt | null = null;
  private transcript: PortableTranscriptEntry[] = [];
  private toolSequence = 0;

  constructor(private readonly options: RoutingProviderOptions) {
    this.primary = options.primary(this.trackedTools('primary'));
    this.fallback = options.fallback(this.trackedTools('fallback'));
  }

  async *send(input: AgentUserInput): AsyncIterable<AgentEvent> {
    if (this.active === 'fallback') {
      try {
        yield* this.runAttempt('fallback', input);
      } finally {
        this.clearCurrent('fallback');
      }
      return;
    }

    try {
      yield* this.runAttempt('primary', input);
    } catch (error) {
      const attempt = this.current;
      const canSwitch = attempt?.slot === 'primary'
        && !attempt.unsafeToReplay
        && isFallbackEligibleFailure(error)
        && this.fallbackCanAccept(input)
        && typeof this.fallback.replaceConversation === 'function';
      this.current = null;
      if (!canSwitch) throw error;

      await this.fallback.replaceConversation!(this.transcript);
      this.active = 'fallback';
      try {
        yield* this.runAttempt('fallback', input);
      } finally {
        this.clearCurrent('fallback');
      }
    }
  }

  abort(): void {
    ((this.current?.slot ?? this.active) === 'fallback' ? this.fallback : this.primary).abort();
  }

  async resetConversation(): Promise<void> {
    this.current = null;
    this.transcript = [];
    this.active = 'primary';
    await Promise.all([this.primary.resetConversation(), this.fallback.resetConversation()]);
  }

  supportsAttachments(attachments: readonly AgentAttachment[]): boolean {
    const provider = this.active === 'fallback' ? this.fallback : this.primary;
    return provider.supportsAttachments?.(attachments) === true;
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.primary.close?.(), this.fallback.close?.()]);
  }

  private async *runAttempt(slot: ProviderSlot, input: AgentUserInput): AsyncIterable<AgentEvent> {
    const provider = slot === 'primary' ? this.primary : this.fallback;
    const attempt: TurnAttempt = { slot, entries: [{ type: 'user', input }], unsafeToReplay: false };
    this.current = attempt;
    let completed = false;
    let failed = false;
    try {
      for await (const event of provider.send(input)) {
        if (event.type === 'activity') {
          attempt.unsafeToReplay = true;
          continue;
        }
        if (event.type === 'text') {
          attempt.unsafeToReplay = true;
          appendText(attempt.entries, event.text);
        }
        if (event.type === 'done') completed = true;
        yield event;
      }
      if (completed) {
        this.transcript.push(...attempt.entries);
        this.pruneTranscript();
      }
    } catch (error) {
      failed = true;
      // Keep current set so send() can make its fail-closed routing decision.
      throw error;
    } finally {
      if (!failed && this.current === attempt) this.current = null;
    }
  }

  private trackedTools(slot: ProviderSlot): ToolInvoker {
    return {
      call: async (toolName, input, timeoutMs) => {
        const attempt = this.current;
        if (attempt?.slot === slot) attempt.unsafeToReplay = true;
        const id = `portable_tool_${++this.toolSequence}`;
        try {
          const result = await this.options.bridge.call(toolName, input, timeoutMs);
          if (attempt?.slot === slot) attempt.entries.push({ type: 'tool', id, name: toolName, input, result });
          return result;
        } catch (error) {
          if (attempt?.slot === slot) {
            attempt.entries.push({ type: 'tool', id, name: toolName, input, result: modelToolErrorValue(error) });
          }
          throw error;
        }
      },
    };
  }

  private clearCurrent(slot: ProviderSlot): void {
    if (this.current?.slot === slot) this.current = null;
  }

  private fallbackCanAccept(input: AgentUserInput): boolean {
    const attachments = [
      ...this.transcript.flatMap(entry => entry.type === 'user' ? entry.input.attachments : []),
      ...input.attachments,
    ];
    return attachments.length === 0 || this.fallback.supportsAttachments?.(attachments) === true;
  }

  private pruneTranscript(): void {
    for (;;) {
      const attachmentTurns = this.transcript.flatMap((entry, index) => entry.type === 'user' && entry.input.attachments.length ? [index] : []);
      if (attachmentTurns.length <= 1 || !removeFirstTurn(this.transcript, attachmentTurns[0])) break;
    }
    while (this.transcript.filter(entry => entry.type === 'user').length > 40 || transcriptBytes(this.transcript) > 8_000_000) {
      if (!removeFirstTurn(this.transcript, 0)) break;
    }
  }
}

export function isFallbackEligibleFailure(error: unknown): boolean {
  return error instanceof ProviderFailure && FALLBACK_FAILURES.has(error.reason);
}

function appendText(entries: PortableTranscriptEntry[], text: string): void {
  if (!text) return;
  const previous = entries.at(-1);
  if (previous?.type === 'assistant_text') previous.text += text;
  else entries.push({ type: 'assistant_text', text });
}

function removeFirstTurn(entries: PortableTranscriptEntry[], start: number): boolean {
  const next = entries.findIndex((entry, index) => index > start && entry.type === 'user');
  if (next === -1) return false;
  entries.splice(start, next - start);
  return true;
}

function transcriptBytes(entries: PortableTranscriptEntry[]): number {
  const attachmentBytes = entries.reduce((total, entry) => entry.type === 'user'
    ? total + entry.input.attachments.reduce((sum, attachment) => sum + attachment.bytes.byteLength, 0)
    : total, 0);
  try {
    const json = JSON.stringify(entries, (_key, value) => value instanceof Uint8Array ? `[binary:${value.byteLength}]` : value);
    return new TextEncoder().encode(json).byteLength + attachmentBytes;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
