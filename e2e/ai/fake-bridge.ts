import { createServer } from 'node:http';

import { AiBridgeServer } from '../../tools/ai-bridge/src/server';
import type { AgentEvent, AgentProvider, AgentUserInput, ToolInvoker } from '../../tools/ai-bridge/src/provider';

const TOKEN = 'ai-e2e-token';

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
  provider: 'claude',
  allowedOrigins: ['http://127.0.0.1:8081', 'http://localhost:8081'],
  providerFactory: tools => new DeterministicProvider(tools),
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
  await new Promise<void>(resolve => health.close(() => resolve()));
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

async function main(): Promise<void> {
  await bridge.start();
  await new Promise<void>(resolve => health.listen(18788, '127.0.0.1', resolve));
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
