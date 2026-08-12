import { z } from 'zod';
import { MODEL_BRIDGE_TOOLS } from '../../../lib/ai/bridge-tools';
import {
  buildSessionSystemPrompt,
  modelToolErrorValue,
  type AgentEvent,
  type AgentProvider,
  type AgentSessionContext,
  type AgentUserInput,
  ProviderFailure,
  type ProviderDiagnostics,
  type ToolInvoker,
} from './provider';

export const DEFAULT_GEMINI_CHAT_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_ROUNDS = 12;
const MAX_HISTORY_ITEMS = 160;
const MAX_HISTORY_BYTES = 750_000;
const MAX_TOOL_OUTPUT_BYTES = 256_000;
const MAX_SSE_EVENT_BYTES = 2_000_000;
const MAX_STREAM_BYTES = 12_000_000;
const MAX_REQUEST_BYTES = 1_000_000;
const MAX_MULTIMODAL_REQUEST_BYTES = 8_000_000;
const MAX_MULTIMODAL_HISTORY_BYTES = 7_500_000;
const MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_TURN_TIMEOUT_MS = 90_000;

export interface GeminiPartText { text: string }
export interface GeminiPartInlineData { inlineData: { mimeType: string; data: string } }
export interface GeminiPartFunctionCall { functionCall: { name: string; args: Record<string, unknown> } }
export interface GeminiPartFunctionResponse { functionResponse: { name: string; response: Record<string, unknown> } }

export type GeminiPart =
  | GeminiPartText
  | GeminiPartInlineData
  | GeminiPartFunctionCall
  | GeminiPartFunctionResponse;

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

type FetchLike = typeof fetch;

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  systemPrompt?: string;
  fetch?: FetchLike;
  apiBaseUrl?: string;
  turnTimeoutMs?: number;
  sessionTokenBudget?: number;
}

export class GeminiProvider implements AgentProvider {
  private controller: AbortController | null = null;
  private history: GeminiContent[] = [];
  private readonly fetchImpl: FetchLike;
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private sessionTokens = 0;

  constructor(
    private readonly bridge: ToolInvoker,
    private readonly session: AgentSessionContext | undefined,
    private readonly options: GeminiProviderOptions,
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl ?? GEMINI_API_BASE;
    this.model = options.model ?? session?.model ?? DEFAULT_GEMINI_CHAT_MODEL;
  }

  abort(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  resetConversation(): void {
    this.abort();
    this.history = [];
    this.sessionTokens = 0;
  }

  async *send(input: AgentUserInput): AsyncIterable<AgentEvent> {
    this.abort();
    this.controller = new AbortController();
    const signal = this.controller.signal;

    const userParts: GeminiPart[] = [];
    if (input.text.trim()) {
      userParts.push({ text: input.text });
    }
    for (const att of input.attachments) {
      userParts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: Buffer.from(att.bytes).toString('base64'),
        },
      });
    }

    if (userParts.length === 0) {
      userParts.push({ text: '' });
    }

    this.history.push({ role: 'user', parts: userParts });
    this.pruneHistory();

    const startTime = Date.now();
    let turnInputTokens = 0;
    let turnOutputTokens = 0;

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (signal.aborted) throw abortError();

        const endpoint = `${this.apiBaseUrl}/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.options.apiKey)}`;
        const bodyPayload = {
          systemInstruction: {
            parts: [{ text: buildSessionSystemPrompt(this.options.systemPrompt ?? '', this.session) }],
          },
          contents: this.history,
          tools: [{
            functionDeclarations: MODEL_BRIDGE_TOOLS.map(tool => ({
              name: tool.name,
              description: tool.description,
              parameters: z.toJSONSchema(tool.inputSchema, { target: 'draft-7' }),
            })),
          }],
          generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        };

        const reqBody = JSON.stringify(bodyPayload);
        const limit = hasMultimodal(userParts) ? MAX_MULTIMODAL_REQUEST_BYTES : MAX_REQUEST_BYTES;
        if (byteLength(reqBody) > limit) {
          throw new ProviderFailure('GEMINI_REQUEST_TOO_LARGE');
        }

        const timeoutMs = this.options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
        const response = await raceWithAbort(
          fetchWithTimeout(this.fetchImpl, endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: reqBody,
          }, timeoutMs, signal),
          signal,
        );

        if (!response.ok) {
          await cancelBody(response);
          if (response.status === 401 || response.status === 403) {
            throw new ProviderFailure('GEMINI_API_AUTH_FAILED');
          }
          if (response.status === 429) {
            throw new ProviderFailure('GEMINI_RATE_LIMITED');
          }
          if (response.status === 404) {
            throw new ProviderFailure('GEMINI_MODEL_UNAVAILABLE');
          }
          throw new ProviderFailure('GEMINI_API_FAILED');
        }

        let accumulatedText = '';
        const pendingCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

        const streamIter = readSseStream(response, signal);
        for await (const chunkData of streamIter) {
          if (typeof chunkData.error === 'object' && chunkData.error !== null) {
            throw new ProviderFailure('GEMINI_API_FAILED');
          }

          const candidates = Array.isArray(chunkData.candidates) ? chunkData.candidates : [];
          if (candidates.length > 0) {
            const candidate = candidates[0];
            const content = isRecord(candidate.content) ? candidate.content : null;
            const parts = Array.isArray(content?.parts) ? content.parts : [];
            for (const part of parts) {
              if (isRecord(part)) {
                if (typeof part.text === 'string' && part.text) {
                  accumulatedText += part.text;
                  yield { type: 'text', text: part.text };
                }
                if (isRecord(part.functionCall) && typeof part.functionCall.name === 'string') {
                  pendingCalls.push({
                    name: part.functionCall.name,
                    args: isRecord(part.functionCall.args) ? part.functionCall.args : {},
                  });
                }
              }
            }
          }

          const usage = isRecord(chunkData.usageMetadata) ? chunkData.usageMetadata : null;
          if (usage) {
            if (typeof usage.promptTokenCount === 'number') turnInputTokens = usage.promptTokenCount;
            if (typeof usage.candidatesTokenCount === 'number') turnOutputTokens = usage.candidatesTokenCount;
          }
        }

        const budget = this.options.sessionTokenBudget ?? this.session?.sessionTokenBudget;
        if (typeof budget === 'number' && budget > 0) {
          this.sessionTokens += turnOutputTokens;
          if (this.sessionTokens > budget) {
            throw new ProviderFailure('GEMINI_SESSION_BUDGET_EXHAUSTED');
          }
        }

        if (pendingCalls.length === 0) {
          const modelParts: GeminiPart[] = [];
          if (accumulatedText) modelParts.push({ text: accumulatedText });
          if (modelParts.length > 0) {
            this.history.push({ role: 'model', parts: modelParts });
          }
          yield {
            type: 'done',
            stopReason: 'end_turn',
            diagnostics: {
              model: this.model,
              durationMs: Date.now() - startTime,
              inputTokens: turnInputTokens,
              outputTokens: turnOutputTokens,
              totalTokens: turnInputTokens + turnOutputTokens,
            },
          };
          return;
        }

        // Handle tool calls
        const modelCallsParts: GeminiPart[] = pendingCalls.map(call => ({
          functionCall: { name: call.name, args: call.args },
        }));
        if (accumulatedText) {
          modelCallsParts.unshift({ text: accumulatedText });
        }
        this.history.push({ role: 'model', parts: modelCallsParts });

        const responseParts: GeminiPart[] = [];
        for (const call of pendingCalls) {
          if (signal.aborted) throw abortError();
          let toolResult: unknown;
          try {
            toolResult = await this.bridge.call(call.name, call.args);
          } catch (err: unknown) {
            toolResult = modelToolErrorValue(err);
          }
          let safeResult = toolResult;
          const resultStr = JSON.stringify(safeResult);
          if (byteLength(resultStr) > MAX_TOOL_OUTPUT_BYTES) {
            safeResult = { error: 'TOOL_OUTPUT_TOO_LARGE', message: `Output exceeded ${MAX_TOOL_OUTPUT_BYTES} bytes` };
          }
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: isRecord(safeResult) ? safeResult : { output: safeResult },
            },
          });
        }

        this.history.push({ role: 'user', parts: responseParts });
        this.pruneHistory();
      }

      throw new ProviderFailure('GEMINI_ROUND_LIMIT');
    } catch (err: unknown) {
      if (isAbortError(err) || signal.aborted) {
        return;
      }
      if (err instanceof ProviderFailure) {
        throw err;
      }
      throw new ProviderFailure('GEMINI_API_FAILED');
    } finally {
      this.controller = null;
    }
  }

  private pruneHistory(): void {
    const hasMedia = this.history.some(item => hasMultimodal(item.parts));
    const maxBytes = hasMedia ? MAX_MULTIMODAL_HISTORY_BYTES : MAX_HISTORY_BYTES;
    while (this.history.length > 2 && (this.history.length > MAX_HISTORY_ITEMS || byteLength(JSON.stringify(this.history)) > maxBytes)) {
      this.history.splice(0, 2);
    }
  }
}

function hasMultimodal(parts: GeminiPart[]): boolean {
  return parts.some(p => 'inlineData' in p);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function abortError(): DOMException {
  return new DOMException('Turn aborted', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { cleanup(); reject(abortError()); };
    const cleanup = (): void => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      val => { cleanup(); resolve(val); },
      err => { cleanup(); reject(err); },
    );
  });
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const onAbort = (): void => timeoutController.abort();
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    return await fetchImpl(url, { ...init, signal: timeoutController.signal });
  } catch (err: unknown) {
    if (signal.aborted) throw abortError();
    if (timeoutController.signal.aborted) throw new ProviderFailure('GEMINI_API_TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

async function cancelBody(response: Response): Promise<void> {
  try { await response.body?.cancel(); } catch { /* consumed */ }
}

async function* readSseStream(response: Response, signal: AbortSignal): AsyncIterable<Record<string, unknown>> {
  if (!response.body) throw new ProviderFailure('GEMINI_MALFORMED_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let totalBytes = 0;

  try {
    while (true) {
      if (signal.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_STREAM_BYTES) throw new ProviderFailure('GEMINI_STREAM_TOO_LARGE');

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (!dataStr || dataStr === '[DONE]') continue;
          if (byteLength(dataStr) > MAX_SSE_EVENT_BYTES) throw new ProviderFailure('GEMINI_STREAM_EVENT_TOO_LARGE');
          try {
            const parsed: unknown = JSON.parse(dataStr);
            if (isRecord(parsed)) yield parsed;
          } catch {
            throw new ProviderFailure('GEMINI_MALFORMED_RESPONSE');
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
