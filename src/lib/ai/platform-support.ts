import { Platform } from 'react-native';

export type AiPlatformSupport =
  | { supported: true; reason: 'supported' }
  | { supported: false; reason: 'unsupported-native' | 'unsupported-hosted' };

interface AiPlatformEnvironment {
  platformOS?: string;
  origin?: string;
  hasWebSocket?: boolean;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

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
      && LOOPBACK_HOSTS.has(url.hostname)
    ) {
      return { supported: true, reason: 'supported' };
    }
  } catch {
    // Missing or invalid browser origin is outside the local-only boundary.
  }
  return { supported: false, reason: 'unsupported-hosted' };
}
