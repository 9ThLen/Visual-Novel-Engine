/**
 * Deprecated — types have been moved to domain-appropriate files.
 * New code should import directly from:
 * - `@/lib/scene-operations` for Story, StoryScene, Choice
 * - `@/lib/engine/types` for PlaybackState
 * - `@/lib/story-domain` for SaveSlot
 * - `@/lib/user-settings` for UserSettings
 *
 * This file remains as a thin re-export module for backward compatibility.
 * @deprecated Import from the specific domain modules instead.
 */

/** @deprecated Import from @/lib/user-settings instead. */
export type { UserSettings } from './user-settings';

/** @deprecated Import from @/lib/engine/types instead. */
export type { PlaybackState } from './engine/types';
/** @deprecated Import from @/lib/story-domain instead. */
export type { SaveSlot } from './story-domain';
/** @deprecated Import from @/lib/scene-operations instead. */
export type { Story, StoryScene, Choice } from './scene-operations';

