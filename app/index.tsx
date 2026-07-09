import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { loadPlayerConfig } from '@/lib/player-mode';
import { ensurePlayerStorySeeded } from '@/lib/player-mode-boot';

type BootState =
  | { status: 'loading' }
  | { status: 'library' }
  | { status: 'player'; storyId: string };

/**
 * Entry route. In a published web bundle (see `scripts/export-story-web.mjs`)
 * this detects `player-config.json`, seeds its story into the store and routes
 * straight to the reader. Everywhere else it redirects to the library.
 */
export default function Index() {
  const [boot, setBoot] = useState<BootState>(
    Platform.OS === 'web' ? { status: 'loading' } : { status: 'library' },
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    (async () => {
      const config = await loadPlayerConfig();
      if (cancelled) return;
      if (!config) {
        setBoot({ status: 'library' });
        return;
      }
      const storyId = await ensurePlayerStorySeeded(config);
      if (cancelled) return;
      setBoot({ status: 'player', storyId });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot.status === 'loading') return null;
  if (boot.status === 'player') {
    return <Redirect href={{ pathname: '/reader', params: { storyId: boot.storyId, resume: '0' } }} />;
  }
  return <Redirect href="/tabs" />;
}
