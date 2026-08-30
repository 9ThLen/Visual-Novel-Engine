/**
 * What a published player writes down.
 *
 * Almost nothing. A player is handed a story that never changes — it arrives
 * inlined in `index.html` and is seeded fresh on every launch — so persisting it
 * would only be a slower copy of a file the bundle already carries. What belongs
 * to the reader is their progress: where they are, what they saved, which
 * endings they have reached, and how they like the text to look.
 *
 * The narrowness is the point, not an optimisation. The studio's
 * `buildPersistedAppState` writes `storiesMetadata` and `sceneRecordsByStory`,
 * and a player using that shape under the studio's key would overwrite an
 * author's draft with the frozen release the moment a reader opened a novel
 * served from the same origin.
 */
import type { PlaybackState } from '@/lib/engine/runtime-types';
import type { SaveSlot } from '@/lib/story-domain';
import type { Language } from '@/lib/translations';
import { normalizeUserSettings, type UserSettings } from '@/lib/user-settings';

/**
 * Bumped only when the shape below changes. Independent of the studio's version:
 * the two states are different documents under different keys, and tying them
 * together would make an unrelated studio migration reset a reader's progress.
 */
export const PLAYER_PERSIST_VERSION = 1;

export interface PlayerPersistenceState {
  currentStoryId: string | null;
  playbackState: PlaybackState | null;
  saveSlots: SaveSlot[];
  settings: UserSettings;
  language: Language;
  endingsReachedByStory: Record<string, string[]>;
}

export function buildPlayerPersistedState(
  state: PlayerPersistenceState,
): PlayerPersistenceState {
  return {
    currentStoryId: state.currentStoryId,
    playbackState: state.playbackState,
    saveSlots: state.saveSlots,
    settings: state.settings,
    language: state.language,
    endingsReachedByStory: state.endingsReachedByStory,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Restore a reader's progress over the freshly seeded story.
 *
 * Field by field rather than a spread: an older or hand-edited state must not be
 * able to introduce keys the player does not persist — which is exactly how the
 * story would find its way back in.
 */
export function mergePlayerPersistedState<TState extends PlayerPersistenceState>(
  persistedState: unknown,
  currentState: TState,
): TState {
  if (!isRecord(persistedState)) return currentState;

  const merged: TState = { ...currentState };
  if (typeof persistedState.currentStoryId === 'string') {
    merged.currentStoryId = persistedState.currentStoryId;
  }
  if (isRecord(persistedState.playbackState)) {
    merged.playbackState = persistedState.playbackState as unknown as PlaybackState;
  }
  if (Array.isArray(persistedState.saveSlots)) {
    merged.saveSlots = persistedState.saveSlots as SaveSlot[];
  }
  if (isRecord(persistedState.settings)) {
    merged.settings = normalizeUserSettings(persistedState.settings as Partial<UserSettings>);
  }
  if (persistedState.language === 'en' || persistedState.language === 'uk') {
    merged.language = persistedState.language;
  }
  if (isRecord(persistedState.endingsReachedByStory)) {
    merged.endingsReachedByStory = persistedState.endingsReachedByStory as Record<string, string[]>;
  }
  return merged;
}
