/**
 * Receiving the release a build is made from.
 *
 * Over HTTP rather than the socket, and streamed rather than buffered. A release
 * is measured in hundreds of megabytes; holding one in memory to put it in a
 * WebSocket frame would cost two copies of it, and the socket's own message cap
 * exists precisely so that cannot happen by accident.
 *
 * Written to `<requestId>.part` and renamed only once the bytes are complete and
 * the hash matches. A partial file that carried the final name would be
 * indistinguishable from a finished upload after a crash, and the build would be
 * made from a truncated archive.
 */
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';

import { BUILD_LIMITS, isBuildRequestId } from '../../../lib/release/build-request';

export type UploadOutcome =
  | { ok: true; bytes: number; sha256: string; archivePath: string }
  | { ok: false; status: number; code: string; message: string };

export interface UploadOptions {
  directory: string;
  requestId: string;
  /** From the submitted job. An upload with different bytes is refused. */
  expectedHash: string;
  maxBytes?: number;
}

export function buildArchivePath(directory: string, requestId: string): string {
  if (!isBuildRequestId(requestId)) throw new Error(`Unsafe build request id: ${requestId}`);
  return path.join(path.resolve(directory), `${requestId}.vnerelease`);
}

function partPath(directory: string, requestId: string): string {
  return `${buildArchivePath(directory, requestId)}.part`;
}

/**
 * Stream one upload to disk, hashing as it goes.
 *
 * The hash is computed here rather than after the fact so a mismatch costs one
 * pass over the data instead of two, and so the file is never named as if it
 * were trustworthy before anyone has checked.
 */
export async function receiveBuildInput(
  request: IncomingMessage,
  options: UploadOptions,
): Promise<UploadOutcome> {
  const maxBytes = options.maxBytes ?? BUILD_LIMITS.maxUploadBytes;
  const directory = path.resolve(options.directory);
  mkdirSync(directory, { recursive: true });

  const target = buildArchivePath(directory, options.requestId);
  const temp = partPath(directory, options.requestId);

  // An earlier attempt that stopped halfway must not be appended to.
  rmSync(temp, { force: true });

  const hash = createHash('sha256');
  let bytes = 0;
  let overflowed = false;

  const stream = createWriteStream(temp);
  try {
    await new Promise<void>((resolve, reject) => {
      request.on('data', (chunk: Uint8Array) => {
        if (overflowed) return;
        bytes += chunk.byteLength;
        if (bytes > maxBytes) {
          overflowed = true;
          request.destroy();
          reject(new Error('too large'));
          return;
        }
        hash.update(chunk);
        stream.write(chunk);
      });
      request.on('end', () => stream.end(resolve));
      request.on('error', reject);
      stream.on('error', reject);
    });
  } catch (error) {
    stream.destroy();
    rmSync(temp, { force: true });
    if (overflowed) {
      return {
        ok: false,
        status: 413,
        code: 'TOO_LARGE',
        message: `The release exceeds the ${maxBytes}-byte upload limit`,
      };
    }
    return {
      ok: false,
      status: 400,
      code: 'UPLOAD_FAILED',
      message: error instanceof Error ? error.message : 'Upload failed',
    };
  }

  const sha256 = hash.digest('hex');
  if (sha256 !== options.expectedHash) {
    // Not a retryable condition: the bytes are not the ones this request is for,
    // and keeping them would let a later build be made from the wrong release.
    rmSync(temp, { force: true });
    return {
      ok: false,
      status: 409,
      code: 'PAYLOAD_MISMATCH',
      message: 'The uploaded release does not match the hash this request declared',
    };
  }

  renameSync(temp, target);
  return { ok: true, bytes, sha256, archivePath: target };
}

/**
 * Delete `.part` files nobody came back for.
 *
 * An abandoned upload is the normal outcome of a closed laptop, and without this
 * the helper's directory grows by one release per abandoned attempt until
 * somebody notices the disk is full.
 */
export function sweepAbandonedUploads(
  directory: string,
  olderThanMs = BUILD_LIMITS.abandonedUploadMs,
  now = Date.now(),
): string[] {
  const resolved = path.resolve(directory);
  if (!existsSync(resolved)) return [];

  const swept: string[] = [];
  for (const name of readdirSync(resolved)) {
    if (!name.endsWith('.part')) continue;
    const file = path.join(resolved, name);
    try {
      if (now - statSync(file).mtimeMs < olderThanMs) continue;
      rmSync(file, { force: true });
      swept.push(name);
    } catch {
      // Gone already, or locked by a writer that is still going. Either way not
      // this sweep's problem.
    }
  }
  return swept;
}
