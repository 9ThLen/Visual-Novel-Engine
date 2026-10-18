import { createServer } from 'node:http';

import { AiBridgeServer } from '../../../tools/ai-bridge/src/server';
import type { AgentEvent, AgentProvider, AgentUserInput, ToolInvoker } from '../../../tools/ai-bridge/src/provider';

const TOKEN = 'ai-e2e-token';
/** What an agent outside the app presents at `/mcp`; never the pairing token. */
const MCP_TOKEN = 'ai-e2e-mcp-token';

interface SeenEditorContext {
  scene?: { id?: string };
  selection?: { text?: string; anchors?: { stepId?: string | null; match?: string }[] } | null;
  focus?: { blockType?: string; state?: string; match?: string; stepId?: string | null };
}

/** The context block the bridge appended to the user's words, as the model would read it. */
function readEditorContext(text: string): SeenEditorContext | null {
  const match = /<editor_context>\n([\s\S]*?)\n<\/editor_context>/.exec(text);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as SeenEditorContext;
  } catch {
    return null;
  }
}

class DeterministicProvider implements AgentProvider {
  private aborted = false;
  private releaseDelay: (() => void) | null = null;

  constructor(private readonly tools: ToolInvoker) {}

  async *send(input: AgentUserInput): AsyncIterable<AgentEvent> {
    const text = input.text;
    this.aborted = false;
    if (text.includes('[proposal]')) {
      const context = await this.tools.call('get_scene', { sceneId: 'scene_1' }) as {
        activeScene?: { revision?: string };
      };
      await this.tools.call('propose_scene_patch', {
        patch: {
          storyId: text.includes('[story-b]') ? 'demo-advanced-001' : 'demo-story-001',
          sceneId: 'scene_1',
          expectedRevision: context.activeScene?.revision,
          explanation: 'Deterministic browser proposal',
          operations: [{ op: 'update_scene_metadata', updates: { description: 'AI E2E proposal' } }],
        },
      });
      yield { type: 'text', text: 'Proposal resolved.' };
    } else if (text.includes('[context]')) {
      // Says back what it was told the author is pointing at.
      const seen = readEditorContext(text);
      const anchors = seen?.selection?.anchors?.map(anchor => anchor.match).join(',') ?? '';
      const focus = seen?.focus ? `${seen.focus.blockType}/${seen.focus.state}/${seen.focus.match}` : 'none';
      yield { type: 'text', text: seen ? `Saw selection="${seen.selection?.text ?? ''}" anchors=${anchors} focus=${focus}` : 'Saw no context.' };
    } else if (text.includes('[rewrite-selection]')) {
      // Rewrites the step the selection is addressed to, and nothing else.
      const seen = readEditorContext(text);
      const stepId = seen?.selection?.anchors?.find(anchor => anchor.match === 'exact')?.stepId;
      const sceneId = seen?.scene?.id;
      const context = stepId && sceneId
        ? await this.tools.call('get_scene', { sceneId }) as {
            activeScene?: { revision?: string; timeline?: { id: string; blockType: string; data: Record<string, unknown> }[] };
          }
        : null;
      const step = context?.activeScene?.timeline?.find(item => item.id === stepId);
      if (step && sceneId) {
        await this.tools.call('propose_scene_patch', {
          patch: {
            storyId: 'demo-story-001',
            sceneId,
            expectedRevision: context?.activeScene?.revision,
            explanation: 'Deterministic rewrite of the selection',
            operations: [{
              op: 'replace_step',
              stepId: step.id,
              step: { ...step, data: { ...step.data, content: 'AI rewrote the selected line.' } },
            }],
          },
        });
      }
      yield { type: 'text', text: step ? 'Selection rewrite resolved.' : 'No exact selection to rewrite.' };
    } else if (text.includes('[rewrite]')) {
      // Unlike `[proposal]`, this one changes text the open editor is showing.
      const context = await this.tools.call('get_scene', { sceneId: 'scene_1' }) as {
        activeScene?: {
          revision?: string;
          timeline?: { id: string; blockType: string; data: Record<string, unknown> }[];
        };
      };
      const step = context.activeScene?.timeline?.find(item => item.blockType === 'text');
      if (step) {
        await this.tools.call('propose_scene_patch', {
          patch: {
            storyId: 'demo-story-001',
            sceneId: 'scene_1',
            expectedRevision: context.activeScene?.revision,
            explanation: 'Deterministic browser rewrite',
            operations: [{
              op: 'replace_step',
              stepId: step.id,
              step: { ...step, data: { ...step.data, content: 'AI rewrote this line.' } },
            }],
          },
        });
      }
      yield { type: 'text', text: step ? 'Rewrite resolved.' : 'No text step to rewrite.' };
    } else if (text.includes('[long]')) {
      yield { type: 'text', text: 'Long turn started. ' };
      await new Promise<void>(resolve => {
        this.releaseDelay = resolve;
        setTimeout(resolve, 10_000);
      });
      this.releaseDelay = null;
      if (!this.aborted) yield { type: 'text', text: 'This tail must not appear after Stop.' };
    } else {
      yield { type: 'text', text: 'Deterministic ' };
      await new Promise(resolve => setTimeout(resolve, 40));
      if (!this.aborted) yield { type: 'text', text: `reply: ${text}` };
    }
    yield { type: 'done', stopReason: this.aborted ? 'interrupted' : 'end_turn' };
  }

  abort(): void {
    this.aborted = true;
    this.releaseDelay?.();
  }

  resetConversation(): void {
    this.aborted = false;
  }
}

const bridge = new AiBridgeServer({
  port: 18787,
  token: TOKEN,
  mcp: { token: MCP_TOKEN },
  provider: 'claude',
  allowedOrigins: ['http://127.0.0.1:8081', 'http://localhost:8081'],
  providerFactory: tools => new DeterministicProvider(tools),
  logger: () => undefined,
});

/**
 * A second bridge, as `--provider none --mcp` starts one: no chat at all, for
 * an agent of the author's own. On a port of its own, like any second bridge.
 */
const agentBridge = new AiBridgeServer({
  port: 18789,
  token: TOKEN,
  mcp: { token: MCP_TOKEN },
  allowedOrigins: ['http://127.0.0.1:8081', 'http://localhost:8081'],
  logger: () => undefined,
});

const health = createServer((request, response) => {
  if (request.url === '/emit-image') {
    const sendCurrent = (bridge as unknown as {
      sendCurrent(type: 'image_result', payload: unknown): void;
    }).sendCurrent.bind(bridge);
    sendCurrent('image_result', {
      requestId: 'e2e-image-1',
      purpose: 'generated',
      prompt: 'Deterministic one pixel',
      mimeType: 'image/png',
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==',
    });
    response.writeHead(202, { 'content-type': 'text/plain' });
    response.end('emitted');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('ok');
});

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await bridge.close();
  await agentBridge.close();
  await new Promise<void>(resolve => health.close(() => resolve()));
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

async function main(): Promise<void> {
  await bridge.start();
  await agentBridge.start();
  await new Promise<void>(resolve => health.listen(18788, '127.0.0.1', resolve));
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
