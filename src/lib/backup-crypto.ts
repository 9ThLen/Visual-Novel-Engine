import * as Crypto from 'expo-crypto';

import type { BackupBinary } from '@/lib/backup-binary';

export async function sha256Binary(binary: BackupBinary): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await binary.bytes());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
