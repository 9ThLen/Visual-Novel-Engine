export const BRIDGE_PROTOCOL_VERSION = 2 as const;

export const MAX_MESSAGE_BYTES = 1_000_000;
export const MAX_IMAGE_MESSAGE_BYTES = 8_000_000;
export const MAX_DECODED_IMAGE_BYTES = 5_500_000;

export type ClientMessageType =
  | 'session_start'
  | 'session_end'
  | 'user_message'
  | 'interrupt'
  | 'conversation_reset'
  | 'tool_result'
  | 'ping'
  | 'image_result_ack';

export type ServerMessageType =
  | 'session_started'
  | 'assistant_delta'
  | 'assistant_done'
  | 'conversation_reset_ack'
  | 'tool_call'
  | 'status'
  | 'error'
  | 'pong'
  | 'image_result';

export type BridgeErrorCode =
  | 'VALIDATION_FAILED'
  | 'STALE_REVISION'
  | 'PERMISSION_DENIED'
  | 'PROVIDER_UNAVAILABLE'
  | 'CANCELLED'
  | 'UNAUTHORIZED'
  | 'PROTOCOL_ERROR';

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
  details?: unknown;
}

export type BridgeProvider = 'claude' | 'codex';
export interface SessionStartPayload { token?: string; resumeSessionId?: string; context?: { locale?: string } }
export interface SessionStartedPayload { sessionId: string; resumed: boolean; provider: BridgeProvider }

export interface BridgeEnvelope<T = unknown> {
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
  requestId: string;
  sessionId: string;
  type: ClientMessageType | ServerMessageType;
  payload: T;
}

const CLIENT_MESSAGE_TYPES: readonly ClientMessageType[] = [
  'session_start', 'session_end', 'user_message', 'interrupt', 'conversation_reset', 'tool_result', 'ping', 'image_result_ack',
];
const SERVER_MESSAGE_TYPES: readonly ServerMessageType[] = [
  'session_started', 'assistant_delta', 'assistant_done', 'conversation_reset_ack', 'tool_call', 'status', 'error', 'pong', 'image_result',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function isBridgeEnvelope(value: unknown): value is BridgeEnvelope {
  if (!isRecord(value)) return false;
  return value.protocolVersion === BRIDGE_PROTOCOL_VERSION
    && typeof value.requestId === 'string'
    && typeof value.sessionId === 'string'
    && typeof value.type === 'string'
    && (CLIENT_MESSAGE_TYPES.includes(value.type as ClientMessageType)
      || SERVER_MESSAGE_TYPES.includes(value.type as ServerMessageType))
    && 'payload' in value;
}

export function isServerMessage(value: unknown): value is BridgeEnvelope {
  return isBridgeEnvelope(value)
    && SERVER_MESSAGE_TYPES.includes(value.type as ServerMessageType);
}

export function makeEnvelope<T>(
  type: ClientMessageType | ServerMessageType,
  payload: T,
  sessionId = '',
): BridgeEnvelope<T> {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId: crypto.randomUUID(),
    sessionId,
    type,
    payload,
  };
}

export function parseEnvelope(raw: string): BridgeEnvelope | { parseError: string } {
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (byteLength > MAX_IMAGE_MESSAGE_BYTES) return { parseError: `Message exceeds ${MAX_IMAGE_MESSAGE_BYTES} bytes` };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isBridgeEnvelope(parsed)) return { parseError: 'Message is not a valid bridge envelope' };
    const maxBytes = maxBytesForEnvelope(parsed.type, parsed.payload);
    return byteLength <= maxBytes ? parsed : { parseError: `Message exceeds ${maxBytes} bytes` };
  } catch (error: unknown) {
    return { parseError: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}

export function maxBytesForEnvelope(type: BridgeEnvelope['type'], payload: unknown): number {
  if (type === 'image_result') return MAX_IMAGE_MESSAGE_BYTES;
  if (type === 'tool_result' && isRecord(payload) && payload.binaryTool === true) return MAX_IMAGE_MESSAGE_BYTES;
  return MAX_MESSAGE_BYTES;
}
