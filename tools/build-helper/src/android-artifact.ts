import { closeSync, openSync, readSync, statSync } from 'node:fs';

import type { BuildTarget } from '../../../lib/release/build-request';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const MAX_EOCD_SEARCH = 65_557;
const MAX_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 100_000;

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function readExactly(handle: number, length: number, position: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (readSync(handle, bytes, 0, length, position) !== length) {
    throw new Error('Android artifact ended unexpectedly.');
  }
  return bytes;
}

/** Read only the ZIP index; media and native libraries never enter memory. */
export function listAndroidArtifactEntries(filePath: string): Set<string> {
  const size = statSync(filePath).size;
  if (size < 22) throw new Error('Android artifact is not a complete ZIP container.');
  const handle = openSync(filePath, 'r');
  try {
    const tailLength = Math.min(size, MAX_EOCD_SEARCH);
    const tailPosition = size - tailLength;
    const tail = readExactly(handle, tailLength, tailPosition);
    let eocd = -1;
    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
      if (u32(tail, offset) !== EOCD_SIGNATURE) continue;
      if (offset + 22 + u16(tail, offset + 20) !== tail.length) continue;
      eocd = offset;
      break;
    }
    if (eocd < 0) throw new Error('Android artifact has no valid ZIP directory.');

    const entriesExpected = u16(tail, eocd + 10);
    const directorySize = u32(tail, eocd + 12);
    const directoryOffset = u32(tail, eocd + 16);
    const eocdAbsolute = tailPosition + eocd;
    if (
      entriesExpected > MAX_ENTRIES
      || directorySize > MAX_CENTRAL_DIRECTORY_BYTES
      || directoryOffset + directorySize !== eocdAbsolute
    ) {
      throw new Error('Android artifact has an unsupported ZIP directory.');
    }

    const directory = readExactly(handle, directorySize, directoryOffset);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const entries = new Set<string>();
    let offset = 0;
    while (offset < directory.length) {
      if (entries.size >= MAX_ENTRIES || offset + 46 > directory.length) {
        throw new Error('Android artifact ZIP directory is malformed.');
      }
      if (u32(directory, offset) !== CENTRAL_ENTRY_SIGNATURE) {
        throw new Error('Android artifact ZIP directory is malformed.');
      }
      const nameLength = u16(directory, offset + 28);
      const extraLength = u16(directory, offset + 30);
      const commentLength = u16(directory, offset + 32);
      const next = offset + 46 + nameLength + extraLength + commentLength;
      if (nameLength === 0 || next > directory.length) {
        throw new Error('Android artifact ZIP directory is malformed.');
      }
      entries.add(decoder.decode(directory.subarray(offset + 46, offset + 46 + nameLength)));
      offset = next;
    }
    if (entries.size !== entriesExpected) {
      throw new Error('Android artifact ZIP entry count does not match its directory.');
    }
    return entries;
  } finally {
    closeSync(handle);
  }
}

export function verifyAndroidArtifactStructure(filePath: string, target: BuildTarget): void {
  const entries = listAndroidArtifactEntries(filePath);
  const required = target === 'apk'
    ? ['AndroidManifest.xml', 'classes.dex']
    : ['BundleConfig.pb', 'base/manifest/AndroidManifest.xml', 'base/dex/classes.dex'];
  const missing = required.filter((entry) => !entries.has(entry));
  if (missing.length > 0) {
    throw new Error(`The ${target.toUpperCase()} is missing required entries: ${missing.join(', ')}`);
  }
}
