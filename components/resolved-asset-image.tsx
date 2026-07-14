import React, { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { IDB_MEDIA_URI_PREFIX } from '@/lib/idb-storage';

type ResolvedAssetImageProps = Omit<ImageProps, 'source'> & {
  uri: string;
};

export const ResolvedAssetImage = React.memo(function ResolvedAssetImage({
  uri,
  ...props
}: ResolvedAssetImageProps) {
  const [resolved, setResolved] = useState<string | number | null>(
    uri.startsWith(IDB_MEDIA_URI_PREFIX) ? null : uri,
  );

  useEffect(() => {
    if (!uri.startsWith(IDB_MEDIA_URI_PREFIX)) {
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
