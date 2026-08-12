import { BRIDGE_PROTOCOL_VERSION } from '../../lib/bridge-protocol';
import { ClaudeAgentProvider } from './src/claude-provider';
import { OpenAiProvider } from './src/openai-provider';
import type {
  AgentAttachment,
  AgentEvent,
  AgentProvider,
  ProviderDiagnostics,
  ToolInvoker,
} from './src/provider';

type LiveProvider = 'openai' | 'claude';

const providerName = process.argv[2] as LiveProvider | undefined;
const optInVariable = providerName === 'claude' ? 'RUN_CLAUDE_LIVE_SMOKE' : 'RUN_OPENAI_LIVE_SMOKE';

if (providerName !== 'openai' && providerName !== 'claude') {
  console.error('Usage: tsx tools/ai-bridge/smoke-provider.ts <openai|claude>');
  process.exitCode = 2;
} else if (process.env[optInVariable] !== 'true') {
  console.error(`Set ${optInVariable}=true to run the billable ${providerName} smoke test.`);
  process.exitCode = 2;
} else if (providerName === 'openai' && !process.env.OPENAI_API_KEY?.trim()) {
  console.error('OPENAI_API_KEY is required.');
  process.exitCode = 2;
} else {
  await run(providerName);
}

async function run(providerName: LiveProvider): Promise<void> {
  const calls: string[] = [];
  const tools: ToolInvoker = {
    async call(name) {
      calls.push(name);
      if (name === 'list_scenes') return { scenes: [{ id: 'smoke-scene', title: 'Smoke' }] };
      return { ok: true };
    },
  };
  const provider: AgentProvider = providerName === 'openai'
    ? new OpenAiProvider(tools, { locale: 'en' }, {
        apiKey: process.env.OPENAI_API_KEY!,
        model: process.env.OPENAI_CHAT_MODEL,
        systemPrompt: 'You are a Visual Novel Engine smoke-test assistant. Keep replies concise.',
        turnTimeoutMs: 30_000,
      })
    : new ClaudeAgentProvider(tools, { locale: 'en' });

  try {
    const first = await consume(provider.send({ text: 'Reply with exactly: OK', attachments: [] }));
    assertIncludes(first.text, 'OK', 'TEXT_RESPONSE_MISSING');
    await provider.resetConversation();

    let diagnostics = first.diagnostics;
    if (providerName === 'openai') {
      const toolTurn = await consume(provider.send({
        text: 'Call list_scenes once, then reply with exactly: TOOL OK',
        attachments: [],
      }));
      diagnostics = toolTurn.diagnostics;
      if (!calls.includes('list_scenes')) throw new Error('MODEL_TOOL_NOT_CALLED');
      assertIncludes(toolTurn.text, 'TOOL OK', 'TOOL_RESPONSE_MISSING');
      await provider.resetConversation();
    }

    const markers = createMarkers();
    const attachmentTurn = await consume(provider.send({
      text: [
        'Inspect all three attachments. Reply on exactly three short lines:',
        'IMAGE followed by the dominant color in the PNG;',
        'PDF followed by the marker found inside the PDF;',
        'TEXT followed by the marker found inside the text file.',
      ].join(' '),
      attachments: createAttachments(markers),
    }));
    diagnostics = attachmentTurn.diagnostics.model ? attachmentTurn.diagnostics : diagnostics;
    assertIncludes(attachmentTurn.text, markers.pdf, 'PDF_ATTACHMENT_NOT_READ');
    assertIncludes(attachmentTurn.text, markers.text, 'TEXT_ATTACHMENT_NOT_READ');
    if (!/IMAGE\s+(BLUE|BLUISH)/iu.test(attachmentTurn.text)) throw new Error('IMAGE_ATTACHMENT_NOT_READ');

    const followUp = await consume(provider.send({
      text: 'Reply exactly: CONTEXT OK if the immediately previous turn contained one image, one PDF, and one text file.',
      attachments: [],
    }));
    assertIncludes(followUp.text, 'CONTEXT OK', 'ATTACHMENT_FOLLOW_UP_FAILED');

    await provider.resetConversation();
    const afterReset = await consume(provider.send({ text: 'Reply exactly: RESET OK', attachments: [] }));
    assertIncludes(afterReset.text, 'RESET OK', 'RESET_FAILED');

    if (providerName === 'openai') {
      const interrupted = consume(provider.send({ text: 'Wait before answering.', attachments: [] }));
      provider.abort();
      await interrupted.catch((error: unknown) => {
        if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
      });
      await provider.resetConversation();
    }

    console.log(JSON.stringify({
      date: new Date().toISOString(),
      bridgeVersion: '0.1.0',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      provider: providerName,
      model: diagnostics.model,
      responseId: diagnostics.requestId,
      attachments: ['image', 'pdf', 'text'],
      followUp: true,
      reset: true,
      passed: true,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      date: new Date().toISOString(),
      bridgeVersion: '0.1.0',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      provider: providerName,
      passed: false,
      reason: error instanceof Error ? error.message : 'UNKNOWN',
    }));
    process.exitCode = 1;
  } finally {
    await provider.close?.();
  }
}

function createMarkers(): { pdf: string; text: string } {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return { pdf: `PDF_${suffix}`, text: `TEXT_${suffix}` };
}

function createAttachments(markers: { pdf: string; text: string }): AgentAttachment[] {
  const image = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACMSURBVHhe7dAxEQAwDIDAKKmm+r94aXcswPALI3PuPrNhsGkAg00DGGwawGDTAAabBjDYNIDBpgEMNg1gsGkAg00DGGwawGDTAAabBjDYNIDBpgEMNg1gsGkAg00DGGwawGDTAAabBjDYNIDBpgEMNg1gsGkAg00DGGwawGDTAAabBjDYNIDBpgEMNh+dU5IdzBjsQwAAAABJRU5ErkJggg==',
    'base64',
  ));
  const pdf = createPdf(markers.pdf);
  const text = new TextEncoder().encode(`Visual Novel Engine live smoke marker: ${markers.text}`);
  return [
    { id: 'smoke-image', name: 'blue-reference.png', kind: 'image', mimeType: 'image/png', bytes: image },
    { id: 'smoke-pdf', name: 'script.pdf', kind: 'pdf', mimeType: 'application/pdf', bytes: pdf },
    { id: 'smoke-text', name: 'scene.fountain', kind: 'text', mimeType: 'text/plain', bytes: text },
  ];
}

function createPdf(marker: string): Uint8Array {
  const stream = `BT /F1 18 Tf 36 80 Td (${marker}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(body).byteLength);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(body).byteLength;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map(offset => `${offset.toString().padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

function assertIncludes(value: string, expected: string, reason: string): void {
  if (!value.toUpperCase().includes(expected.toUpperCase())) throw new Error(reason);
}

async function consume(events: AsyncIterable<AgentEvent>): Promise<{ text: string; diagnostics: ProviderDiagnostics }> {
  let text = '';
  let diagnostics: ProviderDiagnostics = {};
  for await (const event of events) {
    if (event.type === 'text') text += event.text;
    if (event.type === 'done') diagnostics = event.diagnostics ?? {};
  }
  return { text, diagnostics };
}
