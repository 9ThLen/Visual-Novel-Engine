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

export interface ReaderAssets {
  bgSource: ImageSource | null;
  resolvedCharUris: Record<string, ImageSource | undefined>;
  characterInstances: ReturnType<typeof buildCharacterInstance>[];
}

export function useReaderAssets(
  displaySceneId: string,
  displayBackgroundUri: string | null | undefined,
  characters: { characterId: string; spriteId?: string | null; zIndex?: number }[],
): ReaderAssets {
  const { getAnimValues } = useCharacterAnimations();

  const executorImageState = useMemo(
    () => createExecutorSceneImageState(
      displaySceneId,
      displayBackgroundUri ?? null,
      characters,
    ),
    [displaySceneId, displayBackgroundUri, characters],
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
          'center',
          anim,
        );
      }),
    [characters, getAnimValues],
  );

  return { bgSource, resolvedCharUris, characterInstances };
}
