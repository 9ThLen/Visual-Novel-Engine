export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'activity'; kind: 'tool_call' }
  | { type: 'done'; stopReason?: string; diagnostics?: ProviderDiagnostics };

export type ProviderFailureReason =
  | 'OPENAI_API_AUTH_FAILED' | 'OPENAI_API_FORBIDDEN' | 'OPENAI_RATE_LIMITED'
  | 'OPENAI_MODEL_UNAVAILABLE' | 'OPENAI_API_TIMEOUT' | 'OPENAI_RESPONSE_INCOMPLETE'
  | 'OPENAI_MALFORMED_RESPONSE' | 'OPENAI_REFUSAL' | 'OPENAI_STREAM_TOO_LARGE'
  | 'OPENAI_STREAM_EVENT_TOO_LARGE' | 'OPENAI_STREAM_INCOMPLETE' | 'OPENAI_API_FAILED'
  | 'OPENAI_ROUND_LIMIT' | 'OPENAI_PARALLEL_TOOL_CALLS' | 'OPENAI_MALFORMED_FUNCTION_CALL'
  | 'OPENAI_NON_REPLAYABLE_REASONING' | 'OPENAI_REQUEST_TOO_LARGE' | 'OPENAI_SESSION_BUDGET_EXHAUSTED'
  | 'GEMINI_API_AUTH_FAILED' | 'GEMINI_API_FORBIDDEN' | 'GEMINI_RATE_LIMITED'
  | 'GEMINI_MODEL_UNAVAILABLE' | 'GEMINI_API_TIMEOUT' | 'GEMINI_RESPONSE_INCOMPLETE'
  | 'GEMINI_MALFORMED_RESPONSE' | 'GEMINI_REFUSAL' | 'GEMINI_STREAM_TOO_LARGE'
  | 'GEMINI_STREAM_EVENT_TOO_LARGE' | 'GEMINI_STREAM_INCOMPLETE' | 'GEMINI_API_FAILED'
  | 'GEMINI_ROUND_LIMIT' | 'GEMINI_MALFORMED_FUNCTION_CALL' | 'GEMINI_REQUEST_TOO_LARGE'
  | 'GEMINI_SESSION_BUDGET_EXHAUSTED';

export interface ProviderDiagnostics {
  model?: string;
  requestId?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export class ProviderFailure extends Error {
  constructor(readonly reason: ProviderFailureReason) {
    super(reason);
    this.name = 'ProviderFailure';
  }
}

export interface ToolInvoker {
  call(toolName: string, input: unknown, timeoutMs?: number): Promise<unknown>;
}

export class BridgeToolError extends Error {
  constructor(readonly errorCode: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'BridgeToolError';
  }
}

export function modelToolErrorValue(error: unknown): { errorCode: string; errorMessage: string; details?: unknown } {
  return error instanceof BridgeToolError
    ? { errorCode: error.errorCode, errorMessage: error.message, details: error.details }
    : { errorCode: 'PROVIDER_UNAVAILABLE', errorMessage: error instanceof Error ? error.message : 'Tool failed' };
}

export interface AgentProvider {
  send(input: AgentUserInput): AsyncIterable<AgentEvent>;
  abort(): void;
  resetConversation(): void | Promise<void>;
  replaceConversation?(transcript: readonly PortableTranscriptEntry[]): void | Promise<void>;
  supportsAttachments?(attachments: readonly AgentAttachment[]): boolean;
  close?(): void | Promise<void>;
}

export interface AgentAttachment {
  id: string;
  name: string;
  kind: 'image' | 'pdf' | 'text';
  mimeType: string;
  bytes: Uint8Array;
}

const SUPPORTED_ATTACHMENT_MIMES: Readonly<Record<AgentAttachment['kind'], ReadonlySet<string>>> = {
  image: new Set(['image/jpeg', 'image/png', 'image/webp']),
  pdf: new Set(['application/pdf']),
  text: new Set(['text/plain']),
};

export function supportsBridgeAttachments(attachments: readonly AgentAttachment[]): boolean {
  return attachments.every(attachment =>
    attachment.bytes.byteLength > 0
    && SUPPORTED_ATTACHMENT_MIMES[attachment.kind].has(attachment.mimeType),
  );
}

export interface AgentUserInput {
  text: string;
  attachments: AgentAttachment[];
}

export type PortableTranscriptEntry =
  | { type: 'user'; input: AgentUserInput }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool'; id: string; name: string; input: unknown; result: unknown };

export interface AgentSessionContext { locale?: string; model?: string; sessionTokenBudget?: number }
export type AgentProviderFactory = (tools: ToolInvoker, session?: AgentSessionContext) => AgentProvider;

export function buildSessionSystemPrompt(base: string, session?: AgentSessionContext): string {
  return `${base}\n\nUI locale hint: ${session?.locale ?? 'unknown'}. Use it for product terminology only; always reply in the language of the user's last message.`;
}
