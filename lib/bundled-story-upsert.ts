

import { useAppStore } from '@/stores/use-app-store';
import type { SceneRecord } from '@/lib/engine/types';
import { migrateSceneRecordMap } from '@/lib/audio-block-migration';
import {
  buildCanonicalSceneRecordsFromLegacyScenes, type Story,
} from '@/lib/scene-operations';
import { StoryDomain, normalizeStoryMetadata, type CanonicalStory, type StoryMetadata } from '@/lib/story-domain';

export interface BundledStorySyncPayload {
  metadata: StoryMetadata;
  sceneRecords: Record<string, SceneRecord>;
  characterLibrary: NonNullable<CanonicalStory['characterLibrary']>;
}

export function upsertBundledStory(rawMetadata: StoryMetadata, sceneRecords: Record<string, SceneRecord>, characterLibrary?: CanonicalStory['characterLibrary']): void {
  // Single store-write funnel for bundled + player-mode stories, so a broken
  // theme from either seeding path is sanitized before it reaches the store.
  const metadata = normalizeStoryMetadata(rawMetadata);
  useAppStore.setState((state) => ({
    storiesMetadata: state.storiesMetadata.some((item) => item.id === metadata.id)
      ? state.storiesMetadata.map((item) => item.id === metadata.id ? metadata : item)
      : [...state.storiesMetadata, metadata],
    sceneRecordsByStory: { ...state.sceneRecordsByStory, [metadata.id]: sceneRecords },
    sceneRecordHydration: { ...state.sceneRecordHydration, [metadata.id]: 'full' },
    characterLibraries: characterLibrary?.length ? { ...state.characterLibraries, [metadata.id]: characterLibrary } : state.characterLibraries,
  }));
}

export function createBundledStorySyncPayload(
  bundledStory: Story,
): BundledStorySyncPayload {
  const sceneRecords = buildCanonicalSceneRecordsFromLegacyScenes(
    bundledStory.id,
    bundledStory.scenes || {},
    bundledStory.startSceneId,
  );

  const characters = new Map<string, NonNullable<CanonicalStory['characterLibrary']>[number]>();
  for (const scene of Object.values(bundledStory.scenes || {})) {
    for (const sprite of scene.characters || []) {
      const spriteId = sprite.uri || sprite.id;
      const character = characters.get(sprite.id) ?? {
        id: sprite.id,
        name: sprite.name || sprite.id,
        sprites: [],
        defaultSpriteId: spriteId,
        createdAt: bundledStory.createdAt,
      };
      if (!character.sprites.some((item) => item.id === spriteId)) {
        character.sprites.push({ ...sprite, id: spriteId, createdAt: sprite.createdAt ?? bundledStory.createdAt });
      }
      characters.set(character.id, character);
    }
  }

  return {
    metadata: StoryDomain.extractMetadata(bundledStory),
    sceneRecords: migrateSceneRecordMap(sceneRecords),
    characterLibrary: [...characters.values()],
  };
}
