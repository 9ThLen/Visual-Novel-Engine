/**
 * A scene's page plan, drawn: the story's characters give the sprites and the
 * names, its media the pictures, and the comic frame does the rest.
 *
 * The reader shows the plan of what was read, the editor's Preview the
 * author's plan (comic-layout.ts); both come through here.
 */
import React, { useCallback, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { Character } from '@/lib/character-types';
import { resolveCharacterSpriteUri } from '@/lib/character-resolver';
import type { ComicFrameChoices } from '@/lib/comic/comic-frame-protocol';
import { comicFrameStrip, comicPlanImageRefs, type ComicFrameAssets } from '@/lib/comic/comic-frame-strip';
import type { ComicPagePlan } from '@/lib/comic/comic-layout';
import { useAppStore } from '@/stores/use-app-store';

import { ComicFrame } from '@/components/comic/ComicFrame';
import { useComicImageUrls } from './comic-image-urls';

const NO_CHARACTERS: Character[] = [];

interface ComicPlanViewProps {
  plan: ComicPagePlan;
  storyId: string;
  /** How many panels the reader has opened; all of them when left out. */
  revealed?: number;
  choices?: ComicFrameChoices | null;
  /** Choices made earlier in the strip, by the id of the panel they come after. */
  panelChoices?: Readonly<Record<string, ComicFrameChoices>>;
  textScale?: number;
  onTap?: () => void;
  onChoose?: (optionId: string) => void;
  onLayout?: (layout: { panels: number; pages: number }) => void;
  style?: StyleProp<ViewStyle>;
}

export function ComicPlanView({
  plan,
  storyId,
  revealed,
  choices = null,
  panelChoices,
  textScale = 1,
  onTap,
  onChoose,
  onLayout,
  style,
}: ComicPlanViewProps) {
  const characters = useAppStore((state) => state.characterLibraries[storyId] ?? NO_CHARACTERS);

  const spriteRef = useCallback(
    (characterId: string, spriteId: string) =>
      resolveCharacterSpriteUri(characterId, spriteId, { [storyId]: characters }, storyId),
    [characters, storyId],
  );
  const refs = useMemo(() => comicPlanImageRefs(plan, { spriteRef }), [plan, spriteRef]);
  const urls = useComicImageUrls(refs);

  const strip = useMemo(() => {
    const assets: ComicFrameAssets = {
      imageUrl: (ref) => urls.get(ref) ?? null,
      spriteRef,
      characterName: (characterId) => characters.find((character) => character.id === characterId)?.name ?? null,
    };
    return comicFrameStrip(plan, assets, { revealed, choices, panelChoices });
  }, [characters, choices, panelChoices, plan, revealed, spriteRef, urls]);

  const handleTap = useCallback(() => onTap?.(), [onTap]);
  const handleChoose = useCallback((optionId: string) => onChoose?.(optionId), [onChoose]);

  return (
    <ComicFrame
      strip={strip}
      textScale={textScale}
      onTap={handleTap}
      onChoose={handleChoose}
      onLayout={onLayout}
      style={style}
    />
  );
}
