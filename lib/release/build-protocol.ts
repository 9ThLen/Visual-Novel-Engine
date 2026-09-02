/**
 * The build helper's own message set.
 *
 * Deliberately not the AI bridge's protocol, and not a tool on it. Four reasons,
 * each checkable in the code rather than a matter of taste:
 *
 *   - `lib/bridge-protocol.ts` caps a message at 1 MB (8 MB for images); a
 *     release is measured in hundreds.
 *   - `tools/ai-bridge/src/server.ts` closes the socket on any binary frame.
 *   - It rejects unknown client message types outright.
 *   - `tool_call` runs helper → browser. A build RPC runs the other way.
 *
 * What is reused is the *pairing* model — a local Node process the browser
 * reaches over an authenticated loopback socket — not the protocol. Exposing
 * builds as an AI tool would put a paid, credential-holding operation behind a
 * surface designed to be driven by a language model.
 *
 * The archive itself never travels over this socket. It is uploaded over HTTP
 * (`POST /build-inputs/:requestId`) so it can be streamed to disk and hashed as
 * it arrives, which a WebSocket message cannot do without buffering the whole
 * thing in memory twice.
 */
import {
  BUILD_TARGETS,
  isBuildRequestId,
  isBuildReleaseId,
  parseBuildRequest,
  type BuildRequest,
} from '@/lib/release/build-request';
import { BUILD_STATES, type BuildJobSummary, type BuildState } from '@/lib/release/build-job';

export const BUILD_PROTOCOL_VERSION = 1;

/** A socket frame is small by construction; the payload goes over HTTP. */
export const MAX_BUILD_MESSAGE_BYTES = 64 * 1024;

export type BuildClientMessage =
  | { type: 'hello'; version: number; token: string }
  | { type: 'submit'; request: BuildRequest }
  | { type: 'status'; requestId: string }
  | { type: 'cancel'; requestId: string }
  | { type: 'retry'; requestId: string };

export type BuildServerMessage =
  | { type: 'ready'; version: number }
  | { type: 'progress'; job: BuildJobSummary; log?: string[] }
  | { type: 'completed'; job: BuildJobSummary; log?: string[] }
  | { type: 'failed'; job: BuildJobSummary; log?: string[] }
  | { type: 'error'; code: BuildErrorCode; message: string; requestId?: string };

export const BUILD_ERROR_CODES = [
  'UNAUTHORIZED',
  'UNSUPPORTED_VERSION',
  'MALFORMED',
  'UNKNOWN_REQUEST',
  'PAYLOAD_MISMATCH',
  'BUILDER_UNAVAILABLE',
  'UPLOAD_MISSING',
  'NOT_RETRYABLE',
  'INTERNAL',
] as const;

export type BuildErrorCode = (typeof BUILD_ERROR_CODES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireRequestId(raw: Record<string, unknown>): string {
  const { requestId } = raw;
  if (!isBuildRequestId(requestId)) throw new Error('Invalid build request id');
  return requestId;
}

/**
 * Parse one client frame, or throw.
 *
 * Unknown types are refused rather than ignored: a helper that quietly drops a
 * message it does not understand leaves a client waiting for an answer that will
 * never come, which is the worst of the available behaviours.
 */
export function parseBuildClientMessage(raw: string): BuildClientMessage {
  if (new TextEncoder().encode(raw).byteLength > MAX_BUILD_MESSAGE_BYTES) {
    throw new Error('Build message is too large');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Build message is not JSON');
  }
  if (!isRecord(parsed)) throw new Error('Build message is not an object');

  switch (parsed.type) {
    case 'hello': {
      if (typeof parsed.token !== 'string' || !parsed.token) throw new Error('Missing token');
      const version = typeof parsed.version === 'number' ? parsed.version : 0;
      return { type: 'hello', version, token: parsed.token };
    }
    case 'submit':
      return { type: 'submit', request: parseBuildRequest(parsed.request) };
    case 'status':
      return { type: 'status', requestId: requireRequestId(parsed) };
    case 'cancel':
      return { type: 'cancel', requestId: requireRequestId(parsed) };
    case 'retry':
      return { type: 'retry', requestId: requireRequestId(parsed) };
    default:
      throw new Error(`Unknown build message: ${String(parsed.type)}`);
  }
}

export function encodeBuildServerMessage(message: BuildServerMessage): string {
  return JSON.stringify(message);
}

/** Parse helper output before it is allowed to drive browser state. */
export function parseBuildServerMessage(raw: string): BuildServerMessage {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Build server message is not JSON');
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Build server message is not an object');
  }
  if (value.type === 'ready') {
    if (typeof value.version !== 'number') throw new Error('Invalid build protocol version');
    return { type: 'ready', version: value.version };
  }
  if (value.type === 'error') {
    if (
      typeof value.code !== 'string'
      || !BUILD_ERROR_CODES.includes(value.code as BuildErrorCode)
      || typeof value.message !== 'string'
      || (value.requestId !== undefined && !isBuildRequestId(value.requestId))
    ) {
      throw new Error('Invalid build error');
    }
    return value as unknown as BuildServerMessage;
  }
  if (!['progress', 'completed', 'failed'].includes(value.type) || !isRecord(value.job)) {
    throw new Error('Unknown build server message');
  }
  const job = value.job;
  if (
    !isBuildRequestId(job.requestId)
    || !isBuildReleaseId(job.releaseId)
    || !BUILD_TARGETS.includes(job.target as never)
    || !BUILD_STATES.includes(job.state as never)
    || !Number.isSafeInteger(job.attempt)
    || (job.attempt as number) < 1
    || typeof job.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(job.updatedAt))
    || (job.failureReason !== undefined && typeof job.failureReason !== 'string')
  ) {
    throw new Error('Invalid build job summary');
  }
  if (job.artifact !== undefined) {
    if (
      !isRecord(job.artifact)
      || typeof job.artifact.fileName !== 'string'
      || job.artifact.fileName.length === 0
      || job.artifact.fileName.length > 255
      || /[\\/\r\n]/.test(job.artifact.fileName)
      || !job.artifact.fileName.toLowerCase().endsWith(`.${String(job.target)}`)
      || !Number.isSafeInteger(job.artifact.bytes)
      || (job.artifact.bytes as number) < 0
      || typeof job.artifact.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(job.artifact.sha256)
      || typeof job.artifact.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(job.artifact.expiresAt))
    ) {
      throw new Error('Invalid build artifact');
    }
  }
  if (
    (value.type === 'completed' && job.state !== 'succeeded')
    || (value.type === 'completed' && job.artifact === undefined)
    || (value.type === 'failed' && !['failed', 'cancelled', 'expired'].includes(job.state as string))
    || (value.type === 'progress' && ['succeeded', 'failed', 'cancelled', 'expired'].includes(job.state as string))
  ) {
    throw new Error('Build message does not match job state');
  }
  if (value.log !== undefined && (
    !Array.isArray(value.log)
    || value.log.length > 500
    || value.log.some((line) => typeof line !== 'string')
  )) {
    throw new Error('Invalid build log');
  }
  return value as unknown as BuildServerMessage;
}

/** Which server message a state change should be announced as. */
export function buildMessageForState(state: BuildState): BuildServerMessage['type'] {
  if (state === 'succeeded') return 'completed';
  if (state === 'failed' || state === 'cancelled' || state === 'expired') return 'failed';
  return 'progress';
}
