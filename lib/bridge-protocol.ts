export const BRIDGE_PROTOCOL_VERSION = 1 as const;

export const MAX_MESSAGE_BYTES = 1_000_000;

export type ClientMessageType =
  | 'session_start'
  | 'user_message'
  | 'interrupt'
  | 'tool_result'
  | 'ping';

export type ServerMessageType =
  | 'session_started'
  | 'assistant_delta'
  | 'assistant_done'
  | 'tool_call'
  | 'status'
  | 'error'
  | 'pong';

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

export interface BridgeEnvelope<T = unknown> {
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
  requestId: string;
  sessionId: string;
  type: ClientMessageType | ServerMessageType;
  payload: T;
}

const CLIENT_MESSAGE_TYPES: readonly ClientMessageType[] = [
  'session_start', 'user_message', 'interrupt', 'tool_result', 'ping',
];
const SERVER_MESSAGE_TYPES: readonly ServerMessageType[] = [
  'session_started', 'assistant_delta', 'assistant_done', 'tool_call', 'status', 'error', 'pong',
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
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
    return { parseError: `Message exceeds ${MAX_MESSAGE_BYTES} bytes` };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isBridgeEnvelope(parsed)
      ? parsed
      : { parseError: 'Message is not a valid bridge envelope' };
  } catch (error: unknown) {
    return { parseError: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}
