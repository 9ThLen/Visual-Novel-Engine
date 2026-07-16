import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { MODEL_BRIDGE_TOOLS } from '../../../lib/ai/bridge-tools';
import { buildSessionSystemPrompt, modelToolErrorValue, type AgentEvent, type AgentProvider, type AgentSessionContext, type ToolInvoker } from './provider';

const prompt = readFileSync(fileURLToPath(new URL('./system-prompt.md', import.meta.url)), 'utf8');
const content = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

export class ClaudeAgentProvider implements AgentProvider {
  private controller: AbortController | null = null;
  constructor(private readonly bridge: ToolInvoker, private readonly session?: AgentSessionContext) {}
  get systemPrompt(): string { return buildSessionSystemPrompt(prompt, this.session); }
  abort(): void { this.controller?.abort(); }

  async *send(text: string): AsyncIterable<AgentEvent> {
    this.controller = new AbortController();
    const invoke = async (name: string, input: unknown, timeout?: number) => {
      try { return content(await this.bridge.call(name, input, timeout)); }
      catch (error) {
        return { ...content(modelToolErrorValue(error)), isError: true };
      }
    };
    const mcp = createSdkMcpServer({ name: 'visual-novel', version: '1.0.0', tools: MODEL_BRIDGE_TOOLS.map(def =>
      tool(def.name, def.description, def.inputSchema.shape, input => invoke(def.name, input, def.timeoutMs))) });
    const stream = query({ prompt: text, options: {
      abortController: this.controller, systemPrompt: this.systemPrompt, includePartialMessages: true,
      tools: [], mcpServers: { visualNovel: mcp }, allowedTools: MODEL_BRIDGE_TOOLS.map(def => `mcp__visualNovel__${def.name}`),
      settingSources: [], strictMcpConfig: true,
    } });
    for await (const message of stream) {
      if (message.type === 'stream_event' && message.event.type === 'content_block_delta' && message.event.delta.type === 'text_delta') yield { type: 'text', text: message.event.delta.text };
      if (message.type === 'result') yield { type: 'done', stopReason: message.subtype === 'success' ? (message.stop_reason ?? 'end_turn') : 'error' };
    }
  }
}
