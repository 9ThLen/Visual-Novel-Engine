// Hermes ships a partial URL, which supabase-js relies on. The polyfill is a
// global side effect, so it is installed here — at the one place that builds a
// client — rather than by the library module every test would then have to load.
import 'react-native-url-polyfill/auto';

import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';

import { sha256Binary } from '@/lib/backup-crypto';
import { BackupService } from '@/lib/backup-service';
import {
  createVneSupabaseClient,
  supabaseProjectUrl,
  SupabaseBackupTransport,
} from '@/lib/supabase-backup';
import { createAppLocalRepository } from '@/stores/backup-local-repository';

export interface CloudBackup {
  client: SupabaseClient;
  transport: SupabaseBackupTransport;
  service: BackupService;
}

let cached: CloudBackup | null = null;

/**
 * One client per app, built lazily.
 *
 * A second client would open a second auth listener over the same persisted
 * session key and the two would race on refresh; and creating it eagerly would
 * throw for everyone running without a Supabase env, which must stay a
 * supported way to use the app.
 */
export function getCloudBackup(): CloudBackup {
  if (cached) return cached;

  const client = createVneSupabaseClient();
  const transport = new SupabaseBackupTransport(client, supabaseProjectUrl());
  const service = new BackupService({
    repository: createAppLocalRepository(),
    transport,
    sha256: sha256Binary,
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
  });

  cached = { client, transport, service };
  return cached;
}
