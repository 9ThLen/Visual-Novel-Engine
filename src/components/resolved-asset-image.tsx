import React, { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { getThumbnailUri } from '@/lib/thumbnails';

/**
 * A URI the browser can load as-is. Anything else — an `idb-media://` handle, a
 * bundled `assets/...` path, a bare asset id — has to go through the resolver
 * first, or the <img> requests a path the dev server does not serve and the
 * tile renders empty.
 */
const DIRECTLY_LOADABLE = /^(?:https?:|file:|blob:|data:|\/)/i;

function needsResolution(uri: string): boolean {
  return !DIRECTLY_LOADABLE.test(uri);
}

type ResolvedAssetImageProps = Omit<ImageProps, 'source'> & {
  uri: string;
  /**
   * Ask for a downscaled copy. For a grid of tiles this is the difference
   * between a few megabytes and a few hundred: what an image costs on screen is
   * its decoded bitmap, which the tile size does nothing to reduce.
   *
   * Best effort — where no thumbnail can be made the original is shown, exactly
   * as it would have been.
   */
  thumbnail?: boolean;
};

export const ResolvedAssetImage = React.memo(function ResolvedAssetImage({
  uri,
  thumbnail,
  ...props
}: ResolvedAssetImageProps) {
  const [resolved, setResolved] = useState<string | number | null>(
    needsResolution(uri) ? null : uri,
  );
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  useEffect(() => {
    if (!needsResolution(uri)) {
      setResolved(uri);
      return;
    }

    let active = true;
    setResolved(null);
    void resolveAssetUri(uri).then((value) => {
      if (active) setResolved(value);
    });
    return () => {
      active = false;
    };
  }, [uri]);

  useEffect(() => {
    setThumbnailUri(null);
    // A require id is a native bundled asset: already sized by the packager,
    // and not something fetch can read.
    if (!thumbnail || typeof resolved !== 'string') return;

    let active = true;
    void getThumbnailUri(resolved).then((value) => {
      if (active) setThumbnailUri(value);
    });
    return () => {
      active = false;
    };
  }, [resolved, thumbnail]);

  const source = typeof resolved === 'number'
    ? resolved
    : resolved
      ? { uri: thumbnailUri ?? resolved }
      : undefined;
  return <Image {...props} source={source} />;
});
