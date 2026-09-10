import { useEffect, useState } from 'react';

import { resolveAssetUri } from '@/lib/asset-resolver';

export type ResolvedSource = number | { uri: string };

/**
 * Resolves a set of asset ids to image sources, keeping already-resolved
 * entries between renders.
 *
 * The inspector re-renders on every keystroke in the editor, so this caches by
 * id and only resolves ids it has not seen — flipping between preview frames
 * never re-hits storage for a background or sprite already loaded.
 */
export function useResolvedAssetUris(ids: (string | null | undefined)[]): Record<string, ResolvedSource | null> {
  const [resolved, setResolved] = useState<Record<string, ResolvedSource | null>>({});
  const key = ids.filter(Boolean).join('|');

  useEffect(() => {
    let active = true;
    const wanted = key ? key.split('|') : [];

    const pending = wanted.filter((id) => !(id in resolved));
    if (!pending.length) return () => {
      active = false;
    };

    void Promise.all(
      pending.map(async (id) => {
        try {
          const uri = await resolveAssetUri(id);
          return [id, uri ? (typeof uri === 'number' ? uri : { uri }) : null] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setResolved((previous) => {
        const next = { ...previous };
        for (const [id, source] of entries) next[id] = source;
        return next;
      });
    });

    return () => {
      active = false;
    };
    // `resolved` is read to skip already-known ids but must not retrigger the
    // effect — the state update it causes would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}
