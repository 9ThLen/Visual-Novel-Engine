import { BRIDGE_PROTOCOL_VERSION, MAX_DECODED_IMAGE_BYTES } from '../../lib/bridge-protocol';
import { ClaudeAgentProvider } from './src/claude-provider';
import { createImageToolHandlers } from './src/image-tools';
import { OpenAiProvider } from './src/openai-provider';
import {
  BridgeToolError,
  type AgentAttachment,
  type AgentEvent,
  type AgentProvider,
  type ProviderDiagnostics,
  type ToolInvoker,
} from './src/provider';
type LiveProvider = 'openai' | 'claude' | 'gemini';
type ChatLiveProvider = Exclude<LiveProvider, 'gemini'>;

const args = process.argv.slice(2);
const providerFlagIndex = args.indexOf('--provider');
const providerName = (providerFlagIndex >= 0 ? args[providerFlagIndex + 1] : args.find(arg => !arg.startsWith('--'))) as LiveProvider | undefined;
const imageMode = args.includes('--image');
const optInVariable = imageMode
  ? 'RUN_GEMINI_IMAGE_LIVE_SMOKE'
  : providerName === 'claude' ? 'RUN_CLAUDE_LIVE_SMOKE' : 'RUN_OPENAI_LIVE_SMOKE';

if ((imageMode && providerName !== 'gemini') || (!imageMode && providerName !== 'openai' && providerName !== 'claude')) {
  console.error('Usage: tsx tools/ai-bridge/smoke-provider.ts <openai|claude> | --provider gemini --image');
  process.exitCode = 2;
} else if (process.env[optInVariable] !== 'true') {
  console.error(`Set ${optInVariable}=true to run the billable ${providerName}${imageMode ? ' image' : ''} smoke test.`);
  process.exitCode = 2;
} else if ((providerName === 'openai' && !process.env.OPENAI_API_KEY?.trim())
  || (imageMode && !process.env.GEMINI_API_KEY?.trim())) {
  console.error(`${providerName === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} is required.`);
  process.exitCode = 2;
} else if (imageMode) {
  await runGeminiImage();
} else if (providerName === 'openai' || providerName === 'claude') {
  await run(providerName);
}

async function runGeminiImage(): Promise<void> {
  let emitted: Record<string, unknown> | undefined;
  try {
    const handler = createImageToolHandlers({
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_IMAGE_MODEL,
    }).generate_image;
    const result = await handler({
      prompt: 'A simple blue circle centered on a plain white background.',
      purpose: 'other',
      aspectRatio: '1:1',
      resolution: '1K',
      quality: 'draft',
      outputFormat: 'webp',
    }, {
      callApp: async name => {
        if (name !== 'authorize_capability') throw new Error(`UNEXPECTED_APP_TOOL:${name}`);
        return { allowed: true };
      },
      emitImage: payload => {
        emitted = payload;
        return typeof payload.requestId === 'string' ? payload.requestId : 'smoke-image';
      },
    });
    if (!emitted) throw new Error('IMAGE_RESULT_NOT_EMITTED');
    const mimeType = emitted.mimeType;
    const base64 = emitted.base64;
    if (typeof mimeType !== 'string' || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      throw new Error('UNSUPPORTED_IMAGE_MIME');
    }
    if (typeof base64 !== 'string') throw new Error('IMAGE_BYTES_MISSING');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_DECODED_IMAGE_BYTES) throw new Error('INVALID_IMAGE_SIZE');
    assertImageSignature(mimeType, bytes);
    const metadata = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    console.log(JSON.stringify({
      date: new Date().toISOString(),
      bridgeVersion: '0.1.0',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      provider: 'gemini',
      model: typeof metadata.model === 'string' ? metadata.model : process.env.GEMINI_IMAGE_MODEL,
      requestedFormat: 'webp',
      mimeType,
      sizeBytes: bytes.length,
      passed: true,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      date: new Date().toISOString(),
      bridgeVersion: '0.1.0',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      provider: 'gemini',
      passed: false,
      reason: smokeFailureReason(error),
    }));
    process.exitCode = 1;
  }
}

function assertImageSignature(mimeType: string, bytes: Buffer): void {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const valid = mimeType === 'image/png'
    ? pngSignature.every((value, index) => bytes[index] === value)
    : mimeType === 'image/jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw new Error('IMAGE_SIGNATURE_MISMATCH');
}

function smokeFailureReason(error: unknown): string {
  // Never print raw provider errors: upstream messages can echo request data.
  if (error instanceof BridgeToolError) {
    const details = error.details && typeof error.details === 'object' ? error.details as Record<string, unknown> : {};
    return typeof details.reason === 'string' ? details.reason : error.errorCode;
  }
  const known = error instanceof Error ? error.message : '';
  return /^(?:UNEXPECTED_APP_TOOL:[a-z_]+|IMAGE_RESULT_NOT_EMITTED|UNSUPPORTED_IMAGE_MIME|IMAGE_BYTES_MISSING|INVALID_IMAGE_SIZE|IMAGE_SIGNATURE_MISMATCH)$/u.test(known)
    ? known
    : 'UNKNOWN';
}

async function run(providerName: ChatLiveProvider): Promise<void> {
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
