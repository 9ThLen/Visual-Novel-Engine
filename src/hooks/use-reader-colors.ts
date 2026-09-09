import { useMemo } from 'react';
import { useColors } from '@/hooks/use-colors';
import { mergeReaderColors } from '@/lib/story-theme';
import { useAppStore } from '@/stores/use-app-store';

export function useReaderColors(storyId: string | undefined) {
  const palette = useColors();
  const theme = useAppStore((state) =>
    storyId ? state.storiesMetadata.find((story) => story.id === storyId)?.theme : undefined,
  );

  return useMemo(() => mergeReaderColors(palette, theme), [palette, theme]);
}
