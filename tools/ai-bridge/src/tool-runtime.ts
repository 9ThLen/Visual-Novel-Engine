import { randomUUID } from 'node:crypto';
import { getBridgeTool } from '../../../lib/ai/bridge-tools';
import type { BridgeEnvelope } from '../../../lib/bridge-protocol';
import { BridgeToolError, type ToolInvoker } from './provider';

const IMAGE_BUFFER_TTL_MS = 10 * 60_000;
const IMAGE_BUFFER_MAX_ENTRIES = 5;
const IMAGE_BUFFER_MAX_BYTES = 30_000_000;

export interface BridgeHandlerContext {
  callApp(toolName: string, input: unknown, timeoutMs?: number): Promise<unknown>;
  emitImage(payload: Record<string, unknown>): string;
}

export type BridgeToolHandler = (input: unknown, context: BridgeHandlerContext) => Promise<unknown>;

interface BufferedImage {
  requestId: string;
  payload: Record<string, unknown>;
  decodedBytes: number;
  createdAt: number;
}

export interface BridgeToolRuntimeOptions {
  callApp(toolName: string, input: unknown, timeoutMs?: number): Promise<unknown>;
  emit(type: 'image_result', payload: unknown): void;
  handlers?: Record<string, BridgeToolHandler>;
  logger?: (line: string) => void;
  now?: () => number;
}

export class BridgeToolRuntime implements ToolInvoker {
  private readonly bufferedImages = new Map<string, BufferedImage>();
  private readonly handlers: Record<string, BridgeToolHandler>;
  private readonly now: () => number;
  private imageCallsThisTurn = 0;

  constructor(private readonly options: BridgeToolRuntimeOptions) {
    this.handlers = options.handlers ?? {};
    this.now = options.now ?? Date.now;
  }

  setHandlers(handlers: Record<string, BridgeToolHandler>): void {
    Object.assign(this.handlers, handlers);
  }

  beginTurn(): void { this.imageCallsThisTurn = 0; }

  async call(toolName: string, input: unknown, timeoutMs?: number): Promise<unknown> {
    const definition = getBridgeTool(toolName);
    if (!definition) throw new BridgeToolError('VALIDATION_FAILED', `Unknown tool: ${toolName}`);
    if (definition.site === 'app') return this.options.callApp(toolName, input, timeoutMs ?? definition.timeoutMs);
    const handler = this.handlers[toolName];
    if (!handler) throw new BridgeToolError('PROVIDER_UNAVAILABLE', `Bridge tool is unavailable: ${toolName}`);
    if (toolName === 'generate_image' || toolName === 'edit_image') {
      this.imageCallsThisTurn += 1;
      if (this.imageCallsThisTurn > 3) throw new BridgeToolError('VALIDATION_FAILED', 'Image tool limit (3 per turn) exceeded', { reason: 'IMAGE_TOOL_LIMIT' });
    }
    return handler(input, { callApp: this.options.callApp, emitImage: payload => this.emitImage(payload) });
  }

  acknowledgeImage(requestId: string): void { this.bufferedImages.delete(requestId); }

  reemitBufferedImages(): void {
    this.pruneImages();
    for (const entry of this.bufferedImages.values()) this.options.emit('image_result', entry.payload);
  }

  get bufferedImageCount(): number { this.pruneImages(); return this.bufferedImages.size; }

  private emitImage(payload: Record<string, unknown>): string {
    this.pruneImages();
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : randomUUID();
    const complete: Record<string, unknown> = { ...payload, requestId };
    const base64 = typeof complete.base64 === 'string' ? complete.base64 : '';
    const decodedBytes = Buffer.from(base64, 'base64').length;
    this.bufferedImages.set(requestId, { requestId, payload: complete, decodedBytes, createdAt: this.now() });
    this.enforceBufferCap();
    this.options.emit('image_result', complete);
    return requestId;
  }

  private pruneImages(): void {
    const cutoff = this.now() - IMAGE_BUFFER_TTL_MS;
    for (const [id, entry] of this.bufferedImages) {
      if (entry.createdAt <= cutoff) {
        this.bufferedImages.delete(id);
        this.options.logger?.(`AI Bridge image buffer evicted expired result ${id}`);
      }
    }
  }

  private enforceBufferCap(): void {
    let bytes = [...this.bufferedImages.values()].reduce((sum, item) => sum + item.decodedBytes, 0);
    while (this.bufferedImages.size > IMAGE_BUFFER_MAX_ENTRIES || bytes > IMAGE_BUFFER_MAX_BYTES) {
      const oldest = this.bufferedImages.values().next().value as BufferedImage | undefined;
      if (!oldest) break;
      this.bufferedImages.delete(oldest.requestId);
      bytes -= oldest.decodedBytes;
      this.options.logger?.(`AI Bridge image buffer cap evicted result ${oldest.requestId}`);
    }
  }
}
