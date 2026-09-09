import { Hash } from 'fast-sha256';

import { readBlobBytes } from '@/lib/backup-binary';
import type { StoryArchiveBinarySource } from '@/lib/story-backup/types';

export interface Sha256Result {
  sha256: string;
  size: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Chunks(
  chunks: AsyncIterable<Uint8Array>,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Sha256Result> {
  const hash = new Hash();
  let size = 0;

  try {
    for await (const chunk of chunks) {
      if (!ArrayBuffer.isView(chunk) || chunk.BYTES_PER_ELEMENT !== 1) {
        throw new Error('Story backup source produced a non-binary chunk');
      }
      size += chunk.byteLength;
      if (size > maxBytes) {
        throw new Error(`Story backup entry exceeds the ${maxBytes}-byte limit`);
      }
      hash.update(chunk);
    }
    return { sha256: bytesToHex(hash.digest()), size };
  } finally {
    hash.clean();
  }
}

export function sha256Source(
  source: StoryArchiveBinarySource,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Sha256Result> {
  return sha256Chunks(source.open(), maxBytes);
}

export function sourceFromBytes(bytes: Uint8Array, chunkSize = 64 * 1024): StoryArchiveBinarySource {
  return {
    size: bytes.byteLength,
    async *open() {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        yield bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
      }
    },
  };
}

export function sourceFromBlob(blob: Blob, chunkSize = 64 * 1024): StoryArchiveBinarySource {
  return {
    size: blob.size,
    async *open() {
      if (typeof blob.arrayBuffer !== 'function') {
        const bytes = await readBlobBytes(blob);
        for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
          yield bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
        }
        return;
      }
      for (let offset = 0; offset < blob.size; offset += chunkSize) {
        yield new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
      }
    },
  };
}

export function sourceFromReadableStream(
  openStream: () => ReadableStream<Uint8Array>,
  size?: number,
): StoryArchiveBinarySource {
  return {
    size,
    async *open() {
      const reader = openStream().getReader();
      let finished = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            finished = true;
            return;
          }
          if (value?.byteLength) yield value;
        }
      } finally {
        if (!finished) await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
  };
}
