/**
 * A Blob's bytes as a plain `Uint8Array` this realm owns.
 *
 * `crypto.subtle.digest` takes a BufferSource, and what a `Blob` hands back
 * differs between runtimes: on Node 24 with jsdom it is an ordinary
 * `ArrayBuffer`, and on Node 20 — which is what CI runs — WebCrypto rejects it
 * with "2nd argument is not instance of ArrayBuffer, Buffer, TypedArray, or
 * DataView". Copying costs one pass over bytes that are about to be hashed
 * anyway, and makes every caller independent of which runtime is underneath.
 *
 * Its own module rather than a helper on one of them: both callers hash a
 * downloaded blob, and the alternative was either a dependency edge from the
 * build client into the media library or the same three lines written twice.
 */
export async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  const source = await blob.arrayBuffer();
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(
      (source as ArrayBufferView).buffer,
      (source as ArrayBufferView).byteOffset,
      (source as ArrayBufferView).byteLength,
    )
    : new Uint8Array(source as ArrayBuffer);
  return new Uint8Array(view);
}
