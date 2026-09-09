import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';

/** Stops novel BGM/SFX whenever the current route is not the reader. */
export function ReaderAudioRouteGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const onReader = pathname === '/reader' || pathname.startsWith('/reader') || pathname.includes('reader');
    if (!onReader) {
      void stopReaderPlayback();
    }
  }, [pathname]);

  return null;
}
