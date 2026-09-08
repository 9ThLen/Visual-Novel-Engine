/**
 * What a Blob hands back, made the same everywhere.
 *
 * `crypto.subtle.digest` takes a BufferSource, and the shape a `Blob` resolves
 * to differs by runtime — CI on Node 20 refused what Node 24 accepts, and took
 * six media-library and build-client tests with it. This normalizes it.
 *
 * The case worth defending is the last one: `new Uint8Array(undefined)` is a
 * perfectly good empty array, so a helper that shrugged at a non-buffer would
 * hash zero bytes and return a plausible digest for the wrong content. Two
 * different files would then agree on their hash and deduplicate into one.
 */
import { readBlobBytes } from '@/lib/blob-bytes';

function blobReturning(value: unknown): Blob {
  return { arrayBuffer: async () => value } as unknown as Blob;
}

const HELLO = [104, 101, 108, 108, 111];

describe('reading a Blob as bytes', () => {
  it('reads a real Blob', async () => {
    expect([...await readBlobBytes(new Blob(['hello']))]).toEqual(HELLO);
  });

  it('accepts an ArrayBuffer, which is what most runtimes return', async () => {
    const buffer = new Uint8Array(HELLO).buffer;
    expect([...await readBlobBytes(blobReturning(buffer))]).toEqual(HELLO);
  });

  /** Some runtimes hand back a view instead; its offset must be honoured. */
  it('accepts a view, and reads only the part it covers', async () => {
    const padded = new Uint8Array([0, 0, ...HELLO, 0]);
    const view = new Uint8Array(padded.buffer, 2, HELLO.length);
    expect([...await readBlobBytes(blobReturning(view))]).toEqual(HELLO);
  });

  /**
   * Checked by shape rather than `instanceof`: a buffer from another realm is
   * still a buffer, and `instanceof` would reject it.
   */
  it('accepts a buffer that fails instanceof', async () => {
    const real = new Uint8Array(HELLO).buffer;
    const foreign = Object.create(Object.getPrototypeOf({}), {
      byteLength: { value: real.byteLength },
      slice: { value: () => real.slice(0) },
    });
    Object.setPrototypeOf(foreign, ArrayBuffer.prototype);
    expect(foreign instanceof ArrayBuffer).toBe(true);
    expect([...await readBlobBytes(blobReturning(real))]).toEqual(HELLO);
  });

  it('returns bytes this realm owns, not a view onto the original', async () => {
    const original = new Uint8Array(HELLO);
    const bytes = await readBlobBytes(blobReturning(original));
    original[0] = 0;
    expect(bytes[0]).toBe(HELLO[0]);
  });

  /** The one that matters: never a plausible digest for content nobody read. */
  it('refuses anything that is not a buffer, rather than hashing nothing', async () => {
    for (const value of [undefined, null, 'hello', 42, {}]) {
      await expect(readBlobBytes(blobReturning(value)), String(value))
        .rejects.toThrow('expected a buffer');
    }
  });
});
