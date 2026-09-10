import { useEffect, useState } from 'react';
import { Image } from 'react-native';

import { DEFAULT_CHARACTER_ASPECT_RATIO } from '@/lib/character-layout';

/**
 * Sprite proportions live longer than the component that measured them: a
 * character leaving and re-entering a scene, or the same sprite shown in the
 * preview and in the reader, must not fall back to the default box again.
 */
const aspectRatioCache = new Map<string, number>();

type SpriteSource = string | number | null | undefined;

/** What is known without asking: a bundled asset, or a URI measured before. */
function knownAspectRatio(source: SpriteSource): number | null {
  if (typeof source === 'number') {
    const asset = Image.resolveAssetSource?.(source);
    return asset?.width && asset?.height ? asset.width / asset.height : null;
  }
  return (source && aspectRatioCache.get(source)) || null;
}

/**
 * A sprite's real proportions, so it can be drawn in its own shape rather than
 * in a fixed box.
 *
 * `Image.getSize` is the one API that answers on every platform this app runs
 * on. The image's own load event looked cheaper, but on React Native Web it is
 * delivered after `decode()` resolves, by which point the DOM event no longer
 * carries the element that has the size — so every sprite silently kept the
 * default 9:16 box.
 */
export function useSpriteAspectRatio(source: SpriteSource): number {
  const [aspectRatio, setAspectRatio] = useState(
    () => knownAspectRatio(source) ?? DEFAULT_CHARACTER_ASPECT_RATIO,
  );

  useEffect(() => {
    const known = knownAspectRatio(source);
    setAspectRatio(known ?? DEFAULT_CHARACTER_ASPECT_RATIO);
    if (known || typeof source !== 'string' || !source) return;

    let active = true;
    Image.getSize(
      source,
      (width, height) => {
        if (!width || !height) return;
        aspectRatioCache.set(source, width / height);
        if (active) setAspectRatio(width / height);
      },
      () => {},
    );

    return () => {
      active = false;
    };
  }, [source]);

  return aspectRatio;
}
