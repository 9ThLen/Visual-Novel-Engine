/**
 * An image for a showcase surface, resolved the way the reader resolves scene
 * art: an asset reference here can be a media-library id, a bundled asset path
 * or an IndexedDB media uri, and only asset-resolver knows the difference.
 * (ResolvedAssetImage only resolves the IndexedDB case, so it can't be used.)
 */

import React, { memo, useEffect, useState } from 'react';
import { Image, type ImageProps, type ImageSourcePropType } from 'react-native';

import { getBundledAsset, resolveAssetUri } from '@/lib/asset-resolver';

type ShowcaseImageProps = Omit<ImageProps, 'source'> & {
  assetRef: string;
};

/**
 * A bundled require() is a module id on native but an object on web, and the
 * resolver hands back a plain uri string for stored media — all three are valid
 * sources, so normalize rather than assume.
 */
function toSource(resolved: unknown): ImageSourcePropType | null {
  if (resolved === null || resolved === undefined) return null;
  if (typeof resolved === 'number') return resolved;
  if (typeof resolved === 'string') return { uri: resolved };
  if (typeof resolved === 'object') return resolved as ImageSourcePropType;
  return null;
}

export const ShowcaseImage = memo(function ShowcaseImage({ assetRef, ...props }: ShowcaseImageProps) {
  const [source, setSource] = useState<ImageSourcePropType | null>(() => toSource(getBundledAsset(assetRef)));

  useEffect(() => {
    const bundled = toSource(getBundledAsset(assetRef));
    if (bundled) {
      setSource(bundled);
      return;
    }

    let active = true;
    setSource(null);
    void resolveAssetUri(assetRef)
      .then((resolved) => {
        if (active) setSource(toSource(resolved));
      })
      .catch(() => {
        if (active) setSource(null);
      });

    return () => {
      active = false;
    };
  }, [assetRef]);

  if (!source) return null;
  return <Image {...props} source={source} />;
});
