/**
 * hooks/useReaderAssets.ts — Character animation values + scene image resolution.
 *
 * Extracts character animation cache and scene image loading from
 * StoryReaderResponsive to reduce its hook count.
 */
import { useMemo } from 'react';
import { useSceneImages, type ImageSource } from '@/hooks/useSceneImages';
import { useCharacterAnimations, buildCharacterInstance } from '@/hooks/useCharacterAnimations';
import { createExecutorSceneImageState } from '@/lib/reader-runtime';
import { resolveCharacterSpriteUri } from '@/lib/character-resolver';
import type { Character } from '@/lib/character-types';

export interface ReaderAssets {
  bgSource: ImageSource | null;
  resolvedCharUris: Record<string, ImageSource | undefined>;
  characterInstances: ReturnType<typeof buildCharacterInstance>[];
}

export function useReaderAssets(
  displaySceneId: string,
  displayBackgroundUri: string | null | undefined,
  characters: { characterId: string; spriteId?: string | null; position?: string; zIndex?: number }[],
  characterLibrary: Character[] = [],
  storyId = 'current',
): ReaderAssets {
  const { getAnimValues } = useCharacterAnimations();

  const executorImageState = useMemo(
    () => createExecutorSceneImageState(
      displaySceneId,
      displayBackgroundUri ?? null,
      characters.map((character) => ({
        characterId: character.characterId,
        spriteId: resolveCharacterSpriteUri(
          character.characterId,
          character.spriteId,
          { [storyId]: characterLibrary },
          storyId,
        ) ?? character.spriteId,
        position: character.position,
      })),
    ),
    [displaySceneId, displayBackgroundUri, characters, characterLibrary, storyId],
  );

  const { bgSource, resolvedCharUris } = useSceneImages(executorImageState);

  const characterInstances = useMemo(
    () =>
      characters.map((char) => {
        const charId = char.characterId;
        const anim = getAnimValues(charId);
        return buildCharacterInstance(
          charId,
          char.spriteId ?? '',
          char.zIndex ?? 0,
          (char.position === 'far-left' || char.position === 'left' || char.position === 'center' || char.position === 'right' || char.position === 'far-right')
            ? char.position
            : 'center',
          anim,
        );
      }),
    [characters, getAnimValues],
  );

  return { bgSource, resolvedCharUris, characterInstances };
}
