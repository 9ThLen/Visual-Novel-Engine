/**
 * Thin bridge between the pure appearance-patch core and the Zustand store.
 *
 * Unlike scene patches, appearance changes are NOT rolled back through story
 * snapshots: a snapshot captures scenes plus {title, startSceneId, sceneOrder,
 * tags} and restore only writes scenes back, so it can neither store nor revert
 * a theme. Taking one here would leave the user a snapshot that silently fails
 * to undo the color change. A theme is small and exactly reversible, so we keep
 * the previous theme and write it back verbatim on rollback.
 */
import type { StoryReaderTheme } from '@/lib/story-theme';
import { useAppStore } from '@/stores/use-app-store';
import {
  applyAiAppearancePatch,
  describeAiAppearancePatch,
  validateAiAppearancePatch,
  type AiReaderAppearancePatch,
  type AppearancePatchDescription,
} from './appearance-patch';

export type ApplyAiAppearancePatchToStoreResult =
  | { ok: true; previousTheme: StoryReaderTheme | undefined; description: AppearancePatchDescription }
  | { ok: false; code: 'STALE_REVISION' | 'VALIDATION_FAILED' | 'STORY_NOT_FOUND'; errors: string[] };

export async function applyAiAppearancePatchToStore(
  patch: AiReaderAppearancePatch,
): Promise<ApplyAiAppearancePatchToStoreResult> {
  const state = useAppStore.getState();
  const metadata = state.storiesMetadata.find((story) => story.id === patch.storyId);
  if (!metadata) return { ok: false, code: 'STORY_NOT_FOUND', errors: [`Story '${patch.storyId}' not found`] };

  const validation = validateAiAppearancePatch(metadata, patch);
  if (!validation.ok) return validation;

  const description = describeAiAppearancePatch(metadata, patch);
  const previousTheme = metadata.theme;
  state.updateStoryMetadata(patch.storyId, { theme: applyAiAppearancePatch(metadata, patch) });

  return { ok: true, previousTheme, description };
}

/** Restores the exact theme the story had before the patch (undefined = no theme set). */
export function rollbackAiAppearancePatch(storyId: string, previousTheme: StoryReaderTheme | undefined): boolean {
  const state = useAppStore.getState();
  if (!state.storiesMetadata.some((story) => story.id === storyId)) return false;

  state.updateStoryMetadata(storyId, { theme: previousTheme });
  return true;
}
