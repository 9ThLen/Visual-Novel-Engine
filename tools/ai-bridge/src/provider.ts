export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; stopReason?: string };

export interface ToolInvoker {
  call(toolName: string, input: unknown, timeoutMs?: number): Promise<unknown>;
}

export interface AgentProvider {
  send(text: string): AsyncIterable<AgentEvent>;
  abort(): void;
  close?(): void | Promise<void>;
}

export type AgentProviderFactory = (tools: ToolInvoker) => AgentProvider;
