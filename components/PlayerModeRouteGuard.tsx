import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  getActivePlayerConfig,
  loadPlayerConfig,
  type PlayerConfig,
} from '@/lib/player-mode';
import { ensurePlayerStorySeeded } from '@/lib/player-mode-boot';

/**
 * Keeps a published single-story bundle on the reader. When player mode is
 * active, any navigation to a non-reader route (the library, the editor, etc.)
 * is bounced back to the bundled story. This guards — rather than deletes — the
 * editor routes: they still exist in the generic build but are unreachable here.
 *
 * Inert on native and on the normal (non-published) web app, where there is no
 * `player-config.json` to load.
 */
export function PlayerModeRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [config, setConfig] = useState<PlayerConfig | null>(getActivePlayerConfig());

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    loadPlayerConfig().then((resolved) => {
      if (cancelled || !resolved) return;
      setConfig(resolved);
      // Seed here — not only via the '/' boot gate — so a deep-link or reload
      // straight to /reader (or any editor route) still finds the story in the
      // store. The seed is idempotent and shared with app/index.tsx.
      void ensurePlayerStorySeeded(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    // The reader itself and the transient entry route are allowed through.
    if (pathname === '/reader' || pathname === '/' || pathname === '') return;
    const storyId = (config.story as { id: string }).id;
    router.replace({ pathname: '/reader', params: { storyId, resume: '0' } });
  }, [config, pathname, router]);

  return null;
}
