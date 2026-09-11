import { Platform } from 'react-native';
import { isStudioOrigin } from '@/lib/ai/studio-origins';

export type AiPlatformSupport =
  | { supported: true; reason: 'supported' }
  | { supported: false; reason: 'unsupported-native' | 'unsupported-hosted' };

interface AiPlatformEnvironment {
  platformOS?: string;
  origin?: string;
  hasWebSocket?: boolean;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * The AI tab is shown on a loopback dev server and in the installed studio.
 *
 * The studio's origin is not a loopback host — `tauri.localhost` resolves
 * nowhere — so it is matched exactly, against the same list the bridge's origin
 * policy reads. When these two disagreed, this check was the one that ran first,
 * and it hid the tab rather than reporting a refused connection.
 */
function withinLocalBoundary(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname) || isStudioOrigin(url.origin);
}

export function getAiPlatformSupport(environment: AiPlatformEnvironment = {}): AiPlatformSupport {
  const platformOS = environment.platformOS ?? Platform.OS;
  if (platformOS !== 'web') return { supported: false, reason: 'unsupported-native' };

  const origin = environment.origin
    ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const hasWebSocket = environment.hasWebSocket
    ?? (typeof WebSocket !== 'undefined');

  try {
    const url = new URL(origin);
    if (
      hasWebSocket
      && (url.protocol === 'http:' || url.protocol === 'https:')
      && withinLocalBoundary(url)
    ) {
      return { supported: true, reason: 'supported' };
    }
  } catch {
    // Missing or invalid browser origin is outside the local-only boundary.
  }
  return { supported: false, reason: 'unsupported-hosted' };
}
