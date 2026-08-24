import React, { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import { resolveAssetUri } from '@/lib/asset-resolver';

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
};

export const ResolvedAssetImage = React.memo(function ResolvedAssetImage({
  uri,
  ...props
}: ResolvedAssetImageProps) {
  const [resolved, setResolved] = useState<string | number | null>(
    needsResolution(uri) ? null : uri,
  );

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

  const source = typeof resolved === 'number'
    ? resolved
    : resolved
      ? { uri: resolved }
      : undefined;
  return <Image {...props} source={source} />;
});
