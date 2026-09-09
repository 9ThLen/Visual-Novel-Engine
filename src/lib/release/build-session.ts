import type { BuildJobSummary } from '@/lib/release/build-job';
import { parseBuildServerMessage } from '@/lib/release/build-protocol';
import { parseBuildRequest, type BuildRequest } from '@/lib/release/build-request';
import { createPersistentStorage, type StorageLike } from '@/lib/persistent-storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export interface BuildHelperSettings {
  endpoint: string;
  token: string;
}

export interface PersistedBuildSession {
  request: BuildRequest;
  summary?: BuildJobSummary;
}

export const DEFAULT_BUILD_HELPER_SETTINGS: BuildHelperSettings = {
  endpoint: 'http://127.0.0.1:8790',
  token: '',
};

export function normalizeBuildHelperEndpoint(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Build helper URL must use HTTP or HTTPS.');
  const host = url.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    throw new Error('Build helper must be a loopback address on this machine.');
  }
  if (url.username || url.password) throw new Error('Build helper URL must not contain credentials.');
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export async function loadBuildHelperSettings(
  storage: StorageLike = createPersistentStorage(),
): Promise<BuildHelperSettings> {
  try {
    const parsed = JSON.parse(await storage.getItem(STORAGE_KEYS.BUILD_HELPER_SETTINGS) ?? 'null') as
      Partial<BuildHelperSettings> | null;
    return {
      endpoint: normalizeBuildHelperEndpoint(parsed?.endpoint ?? DEFAULT_BUILD_HELPER_SETTINGS.endpoint),
      token: typeof parsed?.token === 'string' ? parsed.token : '',
    };
  } catch {
    return DEFAULT_BUILD_HELPER_SETTINGS;
  }
}

export async function saveBuildHelperSettings(
  settings: BuildHelperSettings,
  storage: StorageLike = createPersistentStorage(),
): Promise<BuildHelperSettings> {
  const normalized = {
    endpoint: normalizeBuildHelperEndpoint(settings.endpoint),
    token: settings.token.trim(),
  };
  await storage.setItem(STORAGE_KEYS.BUILD_HELPER_SETTINGS, JSON.stringify(normalized));
  return normalized;
}

export async function loadBuildSession(
  storyId: string,
  storage: StorageLike = createPersistentStorage(),
): Promise<PersistedBuildSession | null> {
  try {
    const raw = JSON.parse(await storage.getItem(STORAGE_KEYS.BUILD_SESSION(storyId)) ?? 'null') as
      Partial<PersistedBuildSession> | null;
    if (!raw) return null;
    const request = parseBuildRequest(raw.request);
    let summary: BuildJobSummary | undefined;
    if (raw.summary) {
      try {
        const state = (raw.summary as Partial<BuildJobSummary>).state;
        const type = state === 'succeeded'
          ? 'completed'
          : ['failed', 'cancelled', 'expired'].includes(String(state))
            ? 'failed'
            : 'progress';
        const parsed = parseBuildServerMessage(JSON.stringify({ type, job: raw.summary }));
        if ('job' in parsed && parsed.job.requestId === request.requestId) summary = parsed.job;
      } catch {
        // The request still identifies the durable job; status will replace a
        // stale/corrupt display snapshot after reconnecting.
      }
    }
    return { request, ...(summary ? { summary } : {}) };
  } catch {
    return null;
  }
}

export async function saveBuildSession(
  storyId: string,
  session: PersistedBuildSession,
  storage: StorageLike = createPersistentStorage(),
): Promise<void> {
  await storage.setItem(STORAGE_KEYS.BUILD_SESSION(storyId), JSON.stringify(session));
}

export async function clearBuildSession(
  storyId: string,
  storage: StorageLike = createPersistentStorage(),
): Promise<void> {
  await storage.removeItem(STORAGE_KEYS.BUILD_SESSION(storyId));
}
