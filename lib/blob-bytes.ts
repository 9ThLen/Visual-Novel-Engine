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
  const source: unknown = await blob.arrayBuffer();

  if (ArrayBuffer.isView(source)) {
    const view = source as ArrayBufferView;
    return new Uint8Array(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }
  // Checked by shape, not by `instanceof`: an ArrayBuffer from another realm is
  // still an ArrayBuffer, and `instanceof` would reject it. What must not pass
  // is something that is not a buffer at all.
  if (typeof (source as ArrayBuffer)?.byteLength === 'number') {
    return new Uint8Array(new Uint8Array(source as ArrayBuffer));
  }

  // Loudly, on purpose. `new Uint8Array(undefined)` is an empty array, so a
  // silent fallback here would hash zero bytes and hand back a plausible digest
  // for the wrong content — a worse failure than the one this function exists
  // to avoid, and one no test would catch.
  throw new TypeError(
    `A Blob returned ${Object.prototype.toString.call(source)} from arrayBuffer(); expected a buffer.`,
  );
}
