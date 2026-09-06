/**
 * Who signed this APK, and whether the signature holds.
 *
 * This has been wrong twice, in the same direction both times.
 *
 * First it asked "is it signed?" by looking for the text `APK Sig Block 42`
 * anywhere in the file, which any unsigned APK shipping that string would have
 * passed. Then it located the block properly and hashed the signer's
 * certificate — better, and still not the question. A certificate is public.
 * Identical certificate bytes in two files prove somebody copied a certificate,
 * not that the same private key signed both, and claiming otherwise reads the
 * evidence backwards.
 *
 * So it verifies now, in the sense the word is normally used: the signature is
 * checked against the signed data with the public key, the public key is
 * checked against the one in the certificate, and the digests in the signed
 * data are recomputed over the file's own bytes. A file that fails any of those
 * is reported as unverified with the reason — never as "signed".
 *
 * And it was wrong a third time, more quietly: it returned as soon as one
 * scheme verified. An artifact with a good v2 block and a broken v3 one came
 * back verified, having never looked at v3 -- the block a modern device
 * actually prefers. Every scheme present is checked now, and every signer in
 * each, and they must agree on the certificate.
 *
 * What remains outside this: certificate chains and trust, which Android does
 * not use here -- it pins an app to whatever key signed the first install, so a
 * self-signed certificate is the normal case, and "is this the same key as last
 * time" is a question about a *stored* fingerprint. Also outside: v3's key
 * rotation lineage and the platform's scheme-per-SDK rules. `apksigner verify`
 * is the tool that implements all of it. This refuses whatever it cannot fully
 * check, so those gaps read as failures rather than as passes.
 *
 * Format reference: source.android.com/docs/security/features/apksigning/v2
 * and .../v3.
 */
import { createHash, createPublicKey, verify as verifySignature, X509Certificate } from 'node:crypto';
import { constants as cryptoConstants } from 'node:crypto';

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
/** The comment field is 16 bits, so the record starts within this of the end. */
const EOCD_MAX_SEARCH = 0xffff + EOCD_MIN_SIZE;

const SIGNING_BLOCK_MAGIC = 'APK Sig Block 42';
const V2_BLOCK_ID = 0x7109871a;
const V3_BLOCK_ID = 0xf05368c0;
const V31_BLOCK_ID = 0x1b93ad61;

const SCHEME_NAMES: Record<number, string> = {
  [V2_BLOCK_ID]: 'v2',
  [V3_BLOCK_ID]: 'v3',
  [V31_BLOCK_ID]: 'v3.1',
};

/** Chunk size of the content-digest scheme. Not negotiable; it is in the spec. */
const CHUNK_SIZE = 1024 * 1024;

interface SignatureAlgorithm {
  digest: 'sha256' | 'sha512';
  key: 'rsa-pss' | 'rsa-pkcs1' | 'ec' | 'dsa';
}

/**
 * The algorithm ids Android defines. An id outside this table is a refusal
 * rather than a skip: a signature this cannot check is not a signature it may
 * report as good.
 */
const SIGNATURE_ALGORITHMS: Record<number, SignatureAlgorithm> = {
  0x0101: { digest: 'sha256', key: 'rsa-pss' },
  0x0102: { digest: 'sha512', key: 'rsa-pss' },
  0x0103: { digest: 'sha256', key: 'rsa-pkcs1' },
  0x0104: { digest: 'sha512', key: 'rsa-pkcs1' },
  0x0201: { digest: 'sha256', key: 'ec' },
  0x0202: { digest: 'sha512', key: 'ec' },
  0x0301: { digest: 'sha256', key: 'dsa' },
};

export interface ApkSigning {
  /** Schemes whose blocks are present, e.g. `['v2', 'v3']`. */
  schemes: string[];
  /** SHA-256 of the signer's certificate, `AB:CD:…`, or null if none was read. */
  certificateFingerprint: string | null;
  /** The certificate's subject, for a human reading a report. */
  subject: string | null;
  /** A signing block naming a certificate was found. Says nothing about validity. */
  present: boolean;
  /**
   * The signature was checked against this file's bytes and holds. Only this
   * field licenses the word "signed" about an artifact.
   */
  verified: boolean;
  /**
   * The artifact uses a real feature this does not implement, so it neither
   * verified nor failed. `apksigner` is the authority in that case; this exists
   * so an unimplemented corner cannot be mistaken for either a pass or a fault
   * in the artifact.
   */
  unsupported: boolean;
  /** Why verification did not hold, or what is not supported. */
  problem: string | null;
}

function findEndOfCentralDirectory(view: DataView, length: number): number {
  const earliest = Math.max(0, length - EOCD_MAX_SEARCH);
  for (let at = length - EOCD_MIN_SIZE; at >= earliest; at -= 1) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) return at;
  }
  throw new Error('Not a zip archive: no end-of-central-directory record.');
}

function readU64(view: DataView, at: number): number {
  const value = view.getBigUint64(at, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('APK signing block: a length field is implausibly large.');
  }
  return Number(value);
}

/** A cursor over length-prefixed sequences, which is all this format is. */
class Reader {
  private at = 0;
  constructor(private readonly bytes: Uint8Array, private readonly what: string) {}

  get done(): boolean { return this.at >= this.bytes.length; }

  u32(): number {
    if (this.at + 4 > this.bytes.length) throw new Error(`${this.what}: truncated.`);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const value = view.getUint32(this.at, true);
    this.at += 4;
    return value;
  }

  /** The next length-prefixed blob, as its own reader-friendly slice. */
  block(): Uint8Array {
    const length = this.u32();
    if (this.at + length > this.bytes.length) throw new Error(`${this.what}: a length runs past the end.`);
    const slice = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    return slice;
  }
}

interface SigningBlock {
  pairs: Map<number, Uint8Array>;
  /** Where the block begins, which the EOCD must be rewritten to point at. */
  start: number;
  centralDirectory: number;
  endOfCentralDirectory: number;
}

/**
 * The APK Signing Block, located structurally.
 *
 * From the central directory offset backwards through the magic and the two
 * size fields that must agree — never by searching for the magic, so a file
 * that merely contains those sixteen bytes does not read as signed.
 */
function readSigningBlock(bytes: Uint8Array, view: DataView): SigningBlock | null {
  const endOfCentralDirectory = findEndOfCentralDirectory(view, bytes.length);
  const centralDirectory = view.getUint32(endOfCentralDirectory + 16, true);
  if (centralDirectory < 32 || centralDirectory > bytes.length) return null;

  const magic = new TextDecoder('latin1').decode(bytes.subarray(centralDirectory - 16, centralDirectory));
  if (magic !== SIGNING_BLOCK_MAGIC) return null;

  const trailingSize = readU64(view, centralDirectory - 24);
  const start = centralDirectory - 8 - trailingSize;
  if (start < 0 || readU64(view, start) !== trailingSize) {
    throw new Error('APK signing block: its two size fields disagree.');
  }

  const pairs = new Map<number, Uint8Array>();
  let at = start + 8;
  const end = centralDirectory - 24;
  while (at + 12 <= end) {
    const length = readU64(view, at);
    // A pair's length covers its id and value; the last ends exactly where the
    // trailing size field begins.
    if (length < 4 || at + 8 + length > end) break;
    pairs.set(view.getUint32(at + 8, true), bytes.subarray(at + 12, at + 8 + length));
    at += 8 + length;
  }
  return { pairs, start, centralDirectory, endOfCentralDirectory };
}

/**
 * The content digest Android computes over the file.
 *
 * Three sections — the entries, the central directory, and the end record with
 * its central-directory offset rewritten to point at the signing block — each
 * split into one-megabyte chunks, each chunk digested with a `0xa5` prefix, and
 * the chunk digests digested together behind `0x5a`. The prefixes exist so a
 * chunk digest can never be mistaken for a whole-file digest.
 *
 * This is the part that makes the check about *this file* rather than about the
 * signature block in isolation. Without it, a signing block lifted wholesale
 * from a legitimate APK and pasted onto a different one would verify.
 */
function contentDigest(
  bytes: Uint8Array,
  block: SigningBlock,
  algorithm: 'sha256' | 'sha512',
): Uint8Array {
  const endRecord = bytes.slice(block.endOfCentralDirectory);
  new DataView(endRecord.buffer, endRecord.byteOffset, endRecord.byteLength)
    .setUint32(16, block.start, true);

  const sections = [
    bytes.subarray(0, block.start),
    bytes.subarray(block.centralDirectory, block.endOfCentralDirectory),
    endRecord,
  ];

  const chunkDigests: Uint8Array[] = [];
  for (const section of sections) {
    for (let at = 0; at < section.length; at += CHUNK_SIZE) {
      const chunk = section.subarray(at, Math.min(at + CHUNK_SIZE, section.length));
      const prefix = new Uint8Array(5);
      prefix[0] = 0xa5;
      new DataView(prefix.buffer).setUint32(1, chunk.length, true);
      chunkDigests.push(new Uint8Array(
        createHash(algorithm).update(prefix).update(chunk).digest(),
      ));
    }
  }

  const top = new Uint8Array(5);
  top[0] = 0x5a;
  new DataView(top.buffer).setUint32(1, chunkDigests.length, true);
  const hash = createHash(algorithm).update(top);
  for (const digest of chunkDigests) hash.update(digest);
  return new Uint8Array(hash.digest());
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Additional-attribute ids this understands. Anything else is unsupported. */
const PROOF_OF_ROTATION_ATTRIBUTE = 0x3ba06f8c;

/**
 * Raised when the artifact uses something real that this does not implement.
 *
 * Distinct from a signature that fails, because the two deserve opposite
 * treatment: a failure is the artifact's problem, and this is ours. It lets the
 * caller defer to `apksigner` on that point instead of either pretending to
 * have checked or calling a good artifact broken.
 */
export class UnsupportedSignature extends Error {}

interface SignerFields {
  signedData: Uint8Array;
  signatures: { algorithmId: number; signature: Uint8Array }[];
  publicKey: Uint8Array;
  certificate: Uint8Array;
  digests: { algorithmId: number; digest: Uint8Array }[];
}

/**
 * A signer, in whichever layout its scheme uses.
 *
 * v3 is not v2 with a different id. It carries an SDK range in two places -- in
 * the signed data and again in the signer -- and reading it with the v2 layout
 * lands four bytes short at every field after that, so the signatures come back
 * as an SDK number and the public key as something else again. That is how a v3
 * block was being read here. It never showed, because v2 was checked first and
 * every artifact so far carries one.
 */
function readSigner(block: Uint8Array, scheme: string, v3: boolean): SignerFields {
  const signer = new Reader(block, `${scheme} signer`);

  const signedData = signer.block();
  const signedDataReader = new Reader(signedData, `${scheme} signed data`);
  const digestsReader = new Reader(signedDataReader.block(), `${scheme} digests`);
  const digests: SignerFields['digests'] = [];
  while (!digestsReader.done) {
    const entry = new Reader(digestsReader.block(), `${scheme} digest`);
    digests.push({ algorithmId: entry.u32(), digest: entry.block() });
  }

  const certificatesReader = new Reader(signedDataReader.block(), `${scheme} certificates`);
  if (certificatesReader.done) throw new Error(`${scheme}: a signer has no certificate.`);
  const certificate = certificatesReader.block();

  let signedMinSdk = 0;
  let signedMaxSdk = 0;
  if (v3) {
    signedMinSdk = signedDataReader.u32();
    signedMaxSdk = signedDataReader.u32();
  }

  // Everything after the certificates is attributes, and an attribute this does
  // not know can change what the signature means -- key rotation, most of all.
  // Stepping over them silently is how a v3 lineage would have been ignored.
  const attributes = new Reader(signedDataReader.block(), `${scheme} attributes`);
  while (!attributes.done) {
    const attribute = new Reader(attributes.block(), `${scheme} attribute`);
    const id = attribute.u32();
    if (id === PROOF_OF_ROTATION_ATTRIBUTE) {
      throw new UnsupportedSignature(
        `${scheme}: the signer carries a key-rotation lineage, which apksigner evaluates and this does not.`,
      );
    }
    throw new UnsupportedSignature(
      `${scheme}: the signer carries an attribute this does not understand (0x${id.toString(16)}).`,
    );
  }

  if (v3) {
    // The range outside the signed data is the one a device reads when deciding
    // whether this signer applies to it, and nothing signs it. Left uncompared,
    // it could say anything while the signature still checked out.
    const minSdk = signer.u32();
    const maxSdk = signer.u32();
    if (minSdk !== signedMinSdk || maxSdk !== signedMaxSdk) {
      throw new Error(
        `${scheme}: the signer's SDK range (${minSdk}–${maxSdk}) is not the one it signed `
        + `(${signedMinSdk}–${signedMaxSdk}).`,
      );
    }
  }

  const signaturesReader = new Reader(signer.block(), `${scheme} signatures`);
  const signatures: SignerFields['signatures'] = [];
  while (!signaturesReader.done) {
    const entry = new Reader(signaturesReader.block(), `${scheme} signature`);
    signatures.push({ algorithmId: entry.u32(), signature: entry.block() });
  }

  return { signedData, signatures, publicKey: signer.block(), certificate, digests };
}

function verifySigner(
  bytes: Uint8Array,
  block: SigningBlock,
  signerBytes: Uint8Array,
  scheme: string,
  v3: boolean,
): { fingerprint: string; subject: string } {
  const signer = readSigner(signerBytes, scheme, v3);

  // A real certificate object rather than a hashed blob: this throws on bytes
  // that are not a certificate, which hashing them silently would not.
  const certificate = new X509Certificate(signer.certificate);
  const publicKey = createPublicKey({ key: signer.publicKey, format: 'der', type: 'spki' });
  if (!certificate.publicKey.equals(publicKey)) {
    throw new Error(`${scheme}: the signing key does not match the certificate.`);
  }

  const usable = signer.signatures.filter(({ algorithmId }) => algorithmId in SIGNATURE_ALGORITHMS);
  if (usable.length === 0) {
    const ids = signer.signatures.map(({ algorithmId }) => `0x${algorithmId.toString(16)}`);
    throw new Error(`${scheme}: no signature algorithm this can check (${ids.join(', ') || 'none'}).`);
  }

  for (const { algorithmId, signature } of usable) {
    const algorithm = SIGNATURE_ALGORITHMS[algorithmId];
    const options = algorithm.key === 'rsa-pss'
      ? {
        key: publicKey,
        padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
        saltLength: algorithm.digest === 'sha256' ? 32 : 64,
      }
      : publicKey;
    if (!verifySignature(algorithm.digest, signer.signedData, options, signature)) {
      throw new Error(`${scheme}: a signature does not verify against the signed data.`);
    }

    // And the signed data has to be about this file, not some other one.
    const claimed = signer.digests.find((entry) => entry.algorithmId === algorithmId);
    if (!claimed) throw new Error(`${scheme}: no content digest for the algorithm that signed.`);
    if (!sameBytes(claimed.digest, contentDigest(bytes, block, algorithm.digest))) {
      throw new Error(`${scheme}: the content digest does not match the file.`);
    }
  }

  return { fingerprint: certificate.fingerprint256, subject: certificate.subject };
}

/**
 * Every signer in one scheme's block, and every one of them returned.
 *
 * All of them, not the first. A block may name several, and one that does not
 * hold is a failing signature over this file. Returning only the first also
 * made the "all schemes name the same certificate" check a lie: it compared one
 * signer per scheme and never saw the rest.
 */
function verifyScheme(
  bytes: Uint8Array,
  block: SigningBlock,
  value: Uint8Array,
  scheme: string,
  v3: boolean,
): { fingerprint: string; subject: string }[] {
  const signers = new Reader(new Reader(value, scheme).block(), `${scheme} signers`);
  const results: { fingerprint: string; subject: string }[] = [];
  while (!signers.done) {
    results.push(verifySigner(bytes, block, signers.block(), scheme, v3));
  }
  if (results.length === 0) throw new Error(`${scheme}: the block names no signer.`);
  return results;
}

/**
 * Read and verify an APK's signatures.
 *
 * **Every** scheme present is verified, not the first that works. Returning as
 * soon as v2 held meant a corrupt or forged v3 block rode inside an artifact
 * this called verified -- and v3 is the block a modern device prefers, so the
 * one being skipped was the one that would actually be used.
 *
 * This is still not `apksigner`. It does not implement v3's key-rotation
 * lineage, nor the platform's rules about which scheme governs which SDK range.
 * What it does instead is refuse everything it cannot fully check, so the gap
 * surfaces as a failure rather than as a pass.
 */
export function readApkSigning(bytes: Uint8Array): ApkSigning {
  const empty: ApkSigning = {
    schemes: [],
    certificateFingerprint: null,
    subject: null,
    present: false,
    verified: false,
    unsupported: false,
    problem: null,
  };

  let block: SigningBlock | null;
  try {
    block = readSigningBlock(bytes, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch (error) {
    return { ...empty, problem: error instanceof Error ? error.message : String(error) };
  }
  if (!block) return { ...empty, problem: 'No APK signing block; the artifact is unsigned.' };

  const found = block;
  const present = [V2_BLOCK_ID, V3_BLOCK_ID, V31_BLOCK_ID].filter((id) => found.pairs.has(id));
  const schemes = present.map((id) => SCHEME_NAMES[id]);
  if (present.length === 0) {
    return { ...empty, problem: 'The signing block carries no signature scheme this understands.' };
  }

  const failed = (problem: string, unsupported = false): ApkSigning => ({
    schemes,
    certificateFingerprint: null,
    subject: null,
    present: true,
    verified: false,
    unsupported,
    problem,
  });

  const verified: { fingerprint: string; subject: string }[] = [];
  for (const id of present) {
    try {
      verified.push(...verifyScheme(
        bytes,
        found,
        found.pairs.get(id) as Uint8Array,
        SCHEME_NAMES[id],
        id !== V2_BLOCK_ID,
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failed(message, error instanceof UnsupportedSignature);
    }
  }

  // Every signer of every scheme, not one per scheme. Blocks that disagree
  // about who signed describe two different apps, and which one a device
  // believes depends on its version.
  const fingerprints = [...new Set(verified.map((entry) => entry.fingerprint))];
  if (fingerprints.length > 1) {
    return failed(`The signature blocks name ${fingerprints.length} different certificates `
      + `(${fingerprints.join(', ')}).`);
  }

  return {
    schemes,
    certificateFingerprint: verified[0].fingerprint,
    subject: verified[0].subject,
    present: true,
    verified: true,
    unsupported: false,
    problem: null,
  };
}
