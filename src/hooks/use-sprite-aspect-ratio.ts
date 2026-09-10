import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_CHARACTER_ASPECT_RATIO, spriteAspectRatioFromLoadEvent } from '@/lib/character-layout';

/**
 * Sprite proportions live longer than the component that measured them: a
 * character leaving and re-entering a scene, or the same sprite shown in the
 * preview and the reader, must not fall back to the default box again.
 */
const aspectRatioCache = new Map<string, number>();

/**
 * Real proportions of a sprite, learned from the image itself.
 *
 * The size comes from the load event both image components already fire, so
 * nothing is fetched twice and no measuring pass is needed. Until the file
 * loads the caller lays out with the default full-body ratio.
 */
export function useSpriteAspectRatio(uri: string | null | undefined) {
  const [aspectRatio, setAspectRatio] = useState(
    () => (uri ? aspectRatioCache.get(uri) : undefined) ?? DEFAULT_CHARACTER_ASPECT_RATIO,
  );

  useEffect(() => {
    setAspectRatio((uri ? aspectRatioCache.get(uri) : undefined) ?? DEFAULT_CHARACTER_ASPECT_RATIO);
  }, [uri]);

  const onSpriteLoad = useCallback((event: unknown) => {
    const ratio = spriteAspectRatioFromLoadEvent(event);
    if (!ratio) return;
    if (uri) aspectRatioCache.set(uri, ratio);
    setAspectRatio(ratio);
  }, [uri]);

  return { aspectRatio, onSpriteLoad };
}
