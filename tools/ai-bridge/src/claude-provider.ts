import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { aiReaderAppearancePatchSchema } from '../../../lib/ai/appearance-patch';
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
      tool('get_story_overview', 'Get the current story summary, including the reader theme and its revision.', {}, input => invoke('get_story_overview', input)),
      tool('list_scenes', 'List scenes in the current story.', {}, input => invoke('list_scenes', input)),
      tool('get_scene', 'Read a canonical scene including its revision.', { sceneId: z.string().min(1) }, input => invoke('get_scene', input)),
      tool('list_story_images', 'List images already in this story\'s library, with how often each is used.', {}, input => invoke('list_story_images', input)),
      tool('get_image_details', 'Details for one story image, including every block that references it.', { assetId: z.string().min(1) }, input => invoke('get_image_details', input)),
      tool('find_asset_usage', 'Find every scene and block that references an asset.', { assetId: z.string().min(1) }, input => invoke('find_asset_usage', input)),
      tool('propose_scene_patch', 'Propose a scene patch for user review. This never applies it.', { patch: aiScenePatchSchema }, input => invoke('propose_scene_patch', input, 600_000)),
      tool('propose_appearance_patch', 'Propose reader theme colors for user review. This never applies them.', { patch: aiReaderAppearancePatchSchema }, input => invoke('propose_appearance_patch', input, 600_000)),
    ] });
    const stream = query({ prompt: text, options: {
      abortController: this.controller, systemPrompt: prompt, includePartialMessages: true,
      tools: [], mcpServers: { visualNovel: mcp }, allowedTools: [
        'mcp__visualNovel__get_story_overview', 'mcp__visualNovel__list_scenes', 'mcp__visualNovel__get_scene',
        'mcp__visualNovel__list_story_images', 'mcp__visualNovel__get_image_details', 'mcp__visualNovel__find_asset_usage',
        'mcp__visualNovel__propose_scene_patch', 'mcp__visualNovel__propose_appearance_patch',
      ],
      settingSources: [], strictMcpConfig: true,
    } });
    for await (const message of stream) {
      if (message.type === 'stream_event' && message.event.type === 'content_block_delta' && message.event.delta.type === 'text_delta') yield { type: 'text', text: message.event.delta.text };
      if (message.type === 'result') yield { type: 'done', stopReason: message.subtype === 'success' ? (message.stop_reason ?? 'end_turn') : 'error' };
    }
  }
}
