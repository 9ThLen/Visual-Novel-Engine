/**
 * Platform-neutral binary payload for the backup pipeline.
 *
 * `Blob` cannot cross this boundary. React Native's Blob is an opaque handle
 * into a native registry: it exposes only `size`, `type`, `slice()` and
 * `close()` — no `arrayBuffer()`, no `text()` — and its constructor throws
 * outright on `ArrayBuffer`/`TypedArray` parts. Bytes are the only
 * representation both web and native can produce *and* consume.
 */
export interface BackupBinary {
  readonly size: number;
  readonly mimeType: string;
  bytes(): Promise<Uint8Array>;
}

function readBlobWith(
  blob: Blob,
  read: (reader: FileReader) => void,
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read backup binary'));
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    read(reader);
  });
}

export async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  // React Native: FileReader is the only way to get bytes out of a Blob.
  const buffer = await readBlobWith(blob, (reader) => reader.readAsArrayBuffer(blob));
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  return String(await readBlobWith(blob, (reader) => reader.readAsText(blob)));
}

export function binaryFromBytes(bytes: Uint8Array, mimeType: string): BackupBinary {
  return { size: bytes.byteLength, mimeType, bytes: () => Promise.resolve(bytes) };
}

export function binaryFromBlob(blob: Blob, mimeType?: string): BackupBinary {
  let pending: Promise<Uint8Array> | undefined;
  return {
    size: blob.size,
    mimeType: mimeType || blob.type,
    // Assets are read twice — once to hash, once to upload — so decode once.
    bytes: () => (pending ??= readBlobBytes(blob)),
  };
}
