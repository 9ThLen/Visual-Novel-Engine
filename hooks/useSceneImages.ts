import { useState, useEffect } from 'react';
import { resolveAssetUri, getBundledAsset } from '@/lib/asset-resolver';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';

export type ImageSource = number | string | { uri: string };

export interface SceneImageState {
  id: string;
  backgroundImageUri?: string | null;
  characters: {
    id: string;
    name: string;
    uri?: string | null;
    imageUri?: string | null;
  }[];
}

export function useSceneImages(scene: SceneImageState) {
  const [bgSource, setBgSource] = useState<ImageSource | null>(null);
  const [resolvedCharUris, setResolvedCharUris] = useState<Record<string, ImageSource>>({});
  const characterDeps = scene.characters
    .map((char) => `${char.id}:${char.imageUri || char.uri || ''}`)
    .join('|');

  useEffect(() => {
    let mounted = true;
    const bgUri = scene.backgroundImageUri;
    setResolvedCharUris({});

    if (!bgUri) {
      setBgSource(null);
    } else {
      const bundledAsset = getBundledAsset(bgUri);
      if (bundledAsset) {
        setBgSource(bundledAsset);
      } else {
        resolveAssetUri(bgUri).then((uri) => {
          if (mounted && uri) {
            setBgSource(typeof uri === 'string' ? { uri } : uri);
          } else if (mounted) {
            setBgSource(null);
          }
        }).catch(() => {});
      }
    }

    scene.characters.forEach((char) => {
      const charUri = char.imageUri || char.uri;
      if (!charUri) return;
      const bundled = getBundledAsset(charUri);
      if (bundled) {
        if (mounted) setResolvedCharUris((prev) => ({ ...prev, [char.id]: bundled }));
      } else {
        resolveAssetUri(charUri).then((uri) => {
          if (mounted && uri) {
            setResolvedCharUris((prev) => ({ ...prev, [char.id]: typeof uri === 'string' ? { uri } : uri }));
          }
        }).catch(err => {
          ErrorHandler.handle(`Failed to resolve char ${char.name}`, err, ErrorCategory.MEDIA);
        });
      }
    });

    return () => { mounted = false; };
  }, [scene.id, scene.backgroundImageUri, characterDeps]);

  return { bgSource, resolvedCharUris };
}
