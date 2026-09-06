/**
 * Sign an APK for real, so the verifier can be tested against real signatures.
 *
 * The fixtures used to carry arbitrary bytes where a certificate goes and no
 * signature at all, which was fine while the check only hashed whatever it
 * found there. Once the check became a verification, fixtures like that could
 * only ever prove it fails — and a test suite that can only see the failing
 * direction cannot tell a verifier from a refuser.
 *
 * So this generates a key, builds a self-signed certificate for it, computes
 * the content digest the way Android does, and assembles a v2 signing block.
 * A self-signed certificate is not a compromise here: it is what Android
 * expects, since an app is pinned to whatever key signed its first install
 * rather than to a chain.
 *
 * The certificate is hand-encoded because Node can read X.509 and not write it.
 * Only the fields a signature needs are present.
 */
import { createHash, createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';

const V2_BLOCK_ID = 0x7109871a;
/** RSASSA-PKCS1-v1_5 with SHA-256, which is what Android's tooling defaults to. */
const ALGORITHM_ID = 0x0103;
const CHUNK_SIZE = 1024 * 1024;

// ── The smallest DER encoder that can express a certificate ─────────────────

function length(size: number): number[] {
  if (size < 0x80) return [size];
  const bytes: number[] = [];
  for (let value = size; value > 0; value >>>= 8) bytes.unshift(value & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag: number, content: ArrayLike<number>): Uint8Array {
  return Uint8Array.from([tag, ...length(content.length), ...Array.from(content)]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

const sequence = (...parts: Uint8Array[]): Uint8Array => tlv(0x30, concat(parts));
const setOf = (...parts: Uint8Array[]): Uint8Array => tlv(0x31, concat(parts));
const explicit = (tag: number, content: Uint8Array): Uint8Array => tlv(0xa0 | tag, content);
const printable = (value: string): Uint8Array => tlv(0x13, new TextEncoder().encode(value));
const bitString = (bytes: Uint8Array): Uint8Array => tlv(0x03, Uint8Array.from([0, ...bytes]));
const derNull = Uint8Array.from([0x05, 0x00]);

function integer(value: number): Uint8Array {
  const bytes: number[] = [];
  for (let rest = value; rest > 0; rest >>>= 8) bytes.unshift(rest & 0xff);
  if (bytes.length === 0) bytes.push(0);
  if ((bytes[0] & 0x80) !== 0) bytes.unshift(0);
  return tlv(0x02, bytes);
}

function utcTime(date: Date): Uint8Array {
  const pad = (n: number) => String(n).padStart(2, '0');
  const text = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x17, new TextEncoder().encode(text));
}

/** 1.2.840.113549.1.1.11 — sha256WithRSAEncryption. */
const OID_SHA256_RSA = Uint8Array.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]);
/** 2.5.4.3 — commonName. */
const OID_COMMON_NAME = Uint8Array.from([0x06, 0x03, 0x55, 0x04, 0x03]);

export interface SigningKey {
  privateKey: KeyObject;
  publicKeyDer: Uint8Array;
  certificate: Uint8Array;
  fingerprint: string;
}

export function makeSigningKey(commonName = 'VNE Test'): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKeyDer = new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }));

  const name = sequence(setOf(sequence(OID_COMMON_NAME, printable(commonName))));
  const algorithm = sequence(OID_SHA256_RSA, derNull);
  const now = Date.now();
  const tbs = sequence(
    explicit(0, integer(2)), // v3
    integer(1),              // serial
    algorithm,
    name,                    // issuer, and below, the same subject: self-signed
    sequence(utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 86_400_000 * 365))),
    name,
    publicKeyDer,
  );

  const signer = createSign('sha256');
  signer.update(tbs);
  const certificate = sequence(tbs, algorithm, bitString(new Uint8Array(signer.sign(privateKey))));

  const hex = createHash('sha256').update(certificate).digest('hex').toUpperCase();
  return {
    privateKey,
    publicKeyDer,
    certificate,
    fingerprint: (hex.match(/../g) as string[]).join(':'),
  };
}

// ── The signing block ───────────────────────────────────────────────────────

function lengthPrefixed(content: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + content.length);
  new DataView(out.buffer).setUint32(0, content.length, true);
  out.set(content, 4);
  return out;
}

function findEocd(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = bytes.length - 22; at >= 0; at -= 1) {
    if (view.getUint32(at, true) === 0x06054b50) return at;
  }
  throw new Error('no end-of-central-directory record');
}

/**
 * The content digest, computed on the *unsigned* zip.
 *
 * It comes out the same as on the signed one: the block is inserted exactly
 * where the central directory used to start, and the end record's offset field
 * is put back to that value before hashing. So the three sections are byte for
 * byte what they were.
 */
function contentDigest(bytes: Uint8Array): Uint8Array {
  const eocd = findEocd(bytes);
  const centralDirectory = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(eocd + 16, true);

  const sections = [
    bytes.subarray(0, centralDirectory),
    bytes.subarray(centralDirectory, eocd),
    bytes.subarray(eocd),
  ];
  const chunkDigests: Uint8Array[] = [];
  for (const section of sections) {
    for (let at = 0; at < section.length; at += CHUNK_SIZE) {
      const chunk = section.subarray(at, Math.min(at + CHUNK_SIZE, section.length));
      const prefix = new Uint8Array(5);
      prefix[0] = 0xa5;
      new DataView(prefix.buffer).setUint32(1, chunk.length, true);
      chunkDigests.push(new Uint8Array(createHash('sha256').update(prefix).update(chunk).digest()));
    }
  }
  const top = new Uint8Array(5);
  top[0] = 0x5a;
  new DataView(top.buffer).setUint32(1, chunkDigests.length, true);
  const hash = createHash('sha256').update(top);
  for (const digest of chunkDigests) hash.update(digest);
  return new Uint8Array(hash.digest());
}

/** Splice an id-value pair in as an APK Signing Block, correcting the end record. */
function splice(zip: Uint8Array, id: number, value: Uint8Array): Uint8Array {
  const eocd = findEocd(zip);
  const centralDirectory = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    .getUint32(eocd + 16, true);

  const pair = 8 + 4 + value.length;
  const size = pair + 8 + 16;
  const block = new Uint8Array(8 + size);
  const view = new DataView(block.buffer);
  view.setBigUint64(0, BigInt(size), true);
  view.setBigUint64(8, BigInt(4 + value.length), true);
  view.setUint32(16, id, true);
  block.set(value, 20);
  view.setBigUint64(8 + pair, BigInt(size), true);
  block.set(new TextEncoder().encode('APK Sig Block 42'), 16 + pair);

  const out = new Uint8Array(zip.length + block.length);
  out.set(zip.subarray(0, centralDirectory), 0);
  out.set(block, centralDirectory);
  out.set(zip.subarray(centralDirectory), centralDirectory + block.length);
  new DataView(out.buffer).setUint32(eocd + block.length + 16, centralDirectory + block.length, true);
  return out;
}

/**
 * Sign a zip as an APK, properly: the digest covers the file, the signature
 * covers the signed data, and the certificate carries the key that made it.
 */
export function signApk(zip: Uint8Array, key: SigningKey, digest?: Uint8Array): Uint8Array {
  const algorithmId = new Uint8Array(4);
  new DataView(algorithmId.buffer).setUint32(0, ALGORITHM_ID, true);

  const digests = lengthPrefixed(lengthPrefixed(
    concat([algorithmId, lengthPrefixed(digest ?? contentDigest(zip))]),
  ));
  const certificates = lengthPrefixed(lengthPrefixed(key.certificate));
  const signedData = concat([digests, certificates, lengthPrefixed(new Uint8Array(0))]);

  const signer = createSign('sha256');
  signer.update(signedData);
  const signature = new Uint8Array(signer.sign(key.privateKey));

  const signatures = lengthPrefixed(lengthPrefixed(
    concat([algorithmId, lengthPrefixed(signature)]),
  ));
  const signer_ = concat([lengthPrefixed(signedData), signatures, lengthPrefixed(key.publicKeyDer)]);
  const value = lengthPrefixed(lengthPrefixed(signer_));

  return splice(zip, V2_BLOCK_ID, value);
}

/**
 * A signing block that is internally perfect and describes a different file.
 *
 * This is the shape of the attack the content digest exists to stop: a block
 * lifted from a legitimate APK onto another one. Everything parses, the
 * signature verifies against its own signed data, the certificate holds the
 * right key — and the digest is of bytes that are not these bytes.
 *
 * Flipping a byte of the finished file would not test the same thing: it
 * corrupts the deflate stream, and the artifact fails to open long before
 * anything reaches the signature.
 */
export function signApkBadly(zip: Uint8Array, key: SigningKey): Uint8Array {
  const somethingElse = new Uint8Array(zip);
  somethingElse[somethingElse.length - 1] ^= 0xff;
  return signApk(zip, key, contentDigest(somethingElse));
}
