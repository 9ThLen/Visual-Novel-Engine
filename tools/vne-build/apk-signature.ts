/**
 * Who signed this APK.
 *
 * The first version answered "is it signed?" by looking for the text
 * `APK Sig Block 42` anywhere in the file, which any unsigned APK carrying that
 * string in an asset would have passed — and which said nothing about *which*
 * key it was. That is the half of the question that matters here: Android will
 * refuse to install an update signed by a different key than the version
 * already on the phone, and a story whose key changed is a story whose readers
 * must uninstall and lose their saves.
 *
 * So this walks the actual APK Signing Block, finds the signer's X.509
 * certificate, and hashes it. The result is the same SHA-256 fingerprint
 * `keytool -list` prints, which is what `normalizeSigningFingerprint` in
 * `lib/release/native-identity.ts` was written to compare.
 *
 * What this is not: a signature *verification*. It does not check that the
 * digests in the block match the file's contents, so it can say which
 * certificate the block names and cannot say the artifact is untampered. That
 * distinction is kept in the names and reported to the caller, because a check
 * that overstates itself is worse than one that is absent.
 *
 * Format reference: source.android.com/security/apksigning/v2.
 */
import { createHash } from 'node:crypto';

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
/** The comment field is 16 bits, so the record starts within this of the end. */
const EOCD_MAX_SEARCH = 0xffff + EOCD_MIN_SIZE;

const SIGNING_BLOCK_MAGIC = 'APK Sig Block 42';

/** Schemes whose blocks begin with a signer sequence this can read. */
const SIGNER_BLOCK_IDS: Record<number, string> = {
  0x7109871a: 'v2',
  0xf05368c0: 'v3',
  0x1b93ad61: 'v3.1',
};

export interface ApkSigning {
  /** The schemes whose blocks are present, e.g. `['v2', 'v3']`. */
  schemes: string[];
  /** SHA-256 of the signer's certificate, `AB:CD:…`, or null if none was read. */
  certificateFingerprint: string | null;
  /**
   * True when a signing block naming a certificate was found. Not a claim that
   * the signature was checked against the file's contents — see the file header.
   */
  present: boolean;
}

function fingerprint(der: Uint8Array): string {
  const hex = createHash('sha256').update(der).digest('hex').toUpperCase();
  return (hex.match(/../g) as string[]).join(':');
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

/**
 * The id-value pairs of the APK Signing Block, keyed by id.
 *
 * Located structurally — from the central directory offset backwards through
 * the magic and the two size fields that must agree — rather than by searching
 * for the magic, so a file that merely *contains* the magic does not read as
 * signed.
 */
function signingBlockPairs(bytes: Uint8Array, view: DataView): Map<number, Uint8Array> {
  const eocd = findEndOfCentralDirectory(view, bytes.length);
  const centralDirectory = view.getUint32(eocd + 16, true);
  const pairs = new Map<number, Uint8Array>();
  if (centralDirectory < 32 || centralDirectory > bytes.length) return pairs;

  const magic = new TextDecoder('latin1').decode(bytes.subarray(centralDirectory - 16, centralDirectory));
  if (magic !== SIGNING_BLOCK_MAGIC) return pairs;

  const trailingSize = readU64(view, centralDirectory - 24);
  const start = centralDirectory - 8 - trailingSize;
  if (start < 0 || readU64(view, start) !== trailingSize) {
    throw new Error('APK signing block: its two size fields disagree.');
  }

  let at = start + 8;
  const end = centralDirectory - 24;
  while (at + 12 <= end) {
    const length = readU64(view, at);
    // A pair's length covers its id and value; the last one ends exactly where
    // the trailing size field begins.
    if (length < 4 || at + 8 + length > end) break;
    pairs.set(view.getUint32(at + 8, true), bytes.subarray(at + 12, at + 8 + length));
    at += 8 + length;
  }
  return pairs;
}

/**
 * The first signer's certificate out of a v2/v3 block.
 *
 * Length-prefixed all the way down: signers, then one signer, then its signed
 * data, then the digests we step over, then the certificates. The first
 * certificate is the signer's own; the rest of a chain does not identify the
 * key Android holds the app to.
 */
function firstCertificate(block: Uint8Array): Uint8Array | null {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const read = (at: number): number => {
    if (at + 4 > block.length) throw new Error('APK signing block: a signer record is truncated.');
    return view.getUint32(at, true);
  };

  if (block.length < 20) return null;
  read(0);                                  // all signers
  read(4);                                  // this signer
  read(8);                                  // its signed data
  const digestsLength = read(12);
  const certificates = 16 + digestsLength;
  read(certificates);                       // all certificates
  const certificateLength = read(certificates + 4);
  const from = certificates + 8;
  if (certificateLength <= 0 || from + certificateLength > block.length) {
    throw new Error('APK signing block: the certificate runs past the block.');
  }
  return block.subarray(from, from + certificateLength);
}

export function readApkSigning(bytes: Uint8Array): ApkSigning {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pairs = signingBlockPairs(bytes, view);

  const schemes: string[] = [];
  let certificateFingerprint: string | null = null;
  // Ordered oldest first, so the fingerprint comes from v2 when both are there:
  // v2 is the one every supported Android version enforces.
  for (const id of [0x7109871a, 0xf05368c0, 0x1b93ad61]) {
    const block = pairs.get(id);
    if (!block) continue;
    schemes.push(SIGNER_BLOCK_IDS[id]);
    certificateFingerprint ??= (() => {
      const der = firstCertificate(block);
      return der ? fingerprint(der) : null;
    })();
  }

  return { schemes, certificateFingerprint, present: certificateFingerprint !== null };
}
