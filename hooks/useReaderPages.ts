/**
 * hooks/useReaderPages.ts — Page computation from timeline + executor state.
 *
 * Extracts page splitting and display choice mapping from StoryReaderResponsive
 * to reduce its useMemo count.
 */
import { useMemo } from 'react';
import type { TimelineStep } from '@/lib/engine/types';
import { richTextAlignment, withRichTextAlignment } from '@/lib/rich-text';

export interface ReaderPageState {
  pages: string[];
  displayChoices: {
    id: string;
    text: string;
    nextSceneId: string;
    targetSceneId: string | null;
    index: number;
  }[];
  hasChoices: boolean;
  displayBackgroundUri: string | null | undefined;
}

export function useReaderPages(
  timeline: TimelineStep[] | undefined,
  currentStepIndex: number,
  currentChoices: { id: string; text: string; targetSceneId: string | null }[] | null | undefined,
  backgroundAssetId: string | null | undefined,
): ReaderPageState {
  const pages = useMemo(() => {
    const currentBlock = timeline?.[currentStepIndex];
    if (!currentBlock) return [''];
    if (currentBlock.blockType === 'text') {
      const d = currentBlock.data as { content: string };
      const alignment = richTextAlignment(d.content);
      return d.content.split('\n\n').filter(Boolean).map((page) => withRichTextAlignment(page, alignment));
    }
    if (currentBlock.blockType === 'dialogue') {
      const d = currentBlock.data as { entries: { text: string }[] };
      return d.entries.map((e) => e.text);
    }
    return [''];
  }, [timeline, currentStepIndex]);

  const displayChoices = useMemo(
    () =>
      currentChoices?.map((opt, i) => ({
        id: opt.id,
        text: opt.text,
        nextSceneId: opt.targetSceneId ?? '',
        targetSceneId: opt.targetSceneId,
        index: i,
      })) ?? [],
    [currentChoices],
  );

  return {
    pages,
    displayChoices,
    hasChoices: displayChoices.length > 0,
    displayBackgroundUri: backgroundAssetId,
  };
}
