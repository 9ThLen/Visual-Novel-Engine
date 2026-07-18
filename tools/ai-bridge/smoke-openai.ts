import { BRIDGE_PROTOCOL_VERSION } from '../../lib/bridge-protocol';
import { OpenAiProvider } from './src/openai-provider';
import type { AgentEvent, ProviderDiagnostics, ToolInvoker } from './src/provider';

if (process.env.RUN_OPENAI_LIVE_SMOKE !== 'true') {
  console.error('Set RUN_OPENAI_LIVE_SMOKE=true to run the billable OpenAI smoke test.');
  process.exitCode = 2;
} else if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error('OPENAI_API_KEY is required.');
  process.exitCode = 2;
} else {
  const calls: string[] = [];
  const tools: ToolInvoker = {
    async call(name) {
      calls.push(name);
      if (name === 'list_scenes') return { scenes: [{ id: 'smoke-scene', title: 'Smoke' }] };
      return { ok: true };
    },
  };
  const provider = new OpenAiProvider(tools, { locale: 'en' }, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_CHAT_MODEL,
    systemPrompt: 'You are a Visual Novel Engine smoke-test assistant. Keep replies under ten words.',
    turnTimeoutMs: 30_000,
  });

  try {
    const first = await consume(provider.send('Reply with exactly: OK'));
    provider.resetConversation();
    const second = await consume(provider.send('Call list_scenes once, then reply with exactly: TOOL OK'));
    if (!calls.includes('list_scenes')) throw new Error('MODEL_TOOL_NOT_CALLED');

    const interrupted = consume(provider.send('Wait before answering.'));
    provider.abort();
    await interrupted.catch((error: unknown) => {
      if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
    });
    provider.resetConversation();

    console.log(JSON.stringify({
      date: new Date().toISOString(),
      bridgeVersion: '0.1.0',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      model: second.model ?? first.model,
      responseId: second.requestId ?? first.requestId,
      passed: true,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      date: new Date().toISOString(),
      bridgeVersion: '0.1.0',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      passed: false,
      reason: error instanceof Error ? error.name : 'UNKNOWN',
    }));
    process.exitCode = 1;
  }
}

async function consume(events: AsyncIterable<AgentEvent>): Promise<ProviderDiagnostics> {
  let diagnostics: ProviderDiagnostics = {};
  for await (const event of events) {
    if (event.type === 'done') diagnostics = event.diagnostics ?? {};
  }
  return diagnostics;
}
