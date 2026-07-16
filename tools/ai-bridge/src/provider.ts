export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; stopReason?: string };

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
  send(text: string): AsyncIterable<AgentEvent>;
  abort(): void;
  close?(): void | Promise<void>;
}

export interface AgentSessionContext { locale?: string }
export type AgentProviderFactory = (tools: ToolInvoker, session?: AgentSessionContext) => AgentProvider;

export function buildSessionSystemPrompt(base: string, session?: AgentSessionContext): string {
  return `${base}\n\nUI locale hint: ${session?.locale ?? 'unknown'}. Use it for product terminology only; always reply in the language of the user's last message.`;
}
