import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { aiScenePatchSchema } from '../../../lib/ai/scene-patch-types';
import type { AgentEvent, AgentProvider, ToolInvoker } from './provider';

const prompt = readFileSync(fileURLToPath(new URL('./system-prompt.md', import.meta.url)), 'utf8');
const content = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

export class ClaudeAgentProvider implements AgentProvider {
  private controller: AbortController | null = null;
  constructor(private readonly bridge: ToolInvoker) {}
  abort(): void { this.controller?.abort(); }

  async *send(text: string): AsyncIterable<AgentEvent> {
    this.controller = new AbortController();
    const invoke = async (name: string, input: unknown, timeout?: number) => content(await this.bridge.call(name, input, timeout));
    const mcp = createSdkMcpServer({ name: 'visual-novel', version: '1.0.0', tools: [
      tool('get_story_overview', 'Get the current story summary.', {}, input => invoke('get_story_overview', input)),
      tool('list_scenes', 'List scenes in the current story.', {}, input => invoke('list_scenes', input)),
      tool('get_scene', 'Read a canonical scene including its revision.', { sceneId: z.string().min(1) }, input => invoke('get_scene', input)),
      tool('propose_scene_patch', 'Propose a patch for user review. This never applies it.', { patch: aiScenePatchSchema }, input => invoke('propose_scene_patch', input, 600_000)),
    ] });
    const stream = query({ prompt: text, options: {
      abortController: this.controller, systemPrompt: prompt, includePartialMessages: true,
      tools: [], mcpServers: { visualNovel: mcp }, allowedTools: ['mcp__visualNovel__get_story_overview', 'mcp__visualNovel__list_scenes', 'mcp__visualNovel__get_scene', 'mcp__visualNovel__propose_scene_patch'],
      settingSources: [], strictMcpConfig: true,
    } });
    for await (const message of stream) {
      if (message.type === 'stream_event' && message.event.type === 'content_block_delta' && message.event.delta.type === 'text_delta') yield { type: 'text', text: message.event.delta.text };
      if (message.type === 'result') yield { type: 'done', stopReason: message.subtype === 'success' ? (message.stop_reason ?? 'end_turn') : 'error' };
    }
  }
}
