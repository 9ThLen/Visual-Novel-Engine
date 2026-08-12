import Constants from 'expo-constants';

import { writeStoryArchive } from '@/lib/story-backup/archive';
import { captureStoryBackup } from '@/lib/story-backup/capture';
import { createStoryArchiveFileSink } from '@/lib/story-backup/platform-file';
import type { StoryArchiveManifestV1 } from '@/lib/story-backup/types';

export type StoryBackupProgress = 'preparing' | 'collecting' | 'archiving' | 'saving';

export async function exportFullStoryBackup(
  storyId: string,
  title: string,
  onProgress?: (progress: StoryBackupProgress) => void,
): Promise<StoryArchiveManifestV1> {
  onProgress?.('preparing');
  const sink = await createStoryArchiveFileSink(title);
  try {
    onProgress?.('collecting');
    const captured = await captureStoryBackup(storyId);
    onProgress?.('archiving');
    const manifest = await writeStoryArchive({
      ...captured,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
    }, sink);
    onProgress?.('saving');
    return manifest;
  } catch (error) {
    await sink.abort?.(error).catch(() => undefined);
    throw error;
  }
}
