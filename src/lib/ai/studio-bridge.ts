import { isStudioOrigin } from '@/lib/ai/studio-origins';

/**
 * The AI bridge the installed studio carries and can start for itself.
 *
 * Four commands, defined by `tools/studio-shell/src-tauri/src/bridge.rs`. None
 * of them names a path or a program: the executable comes from the application's
 * own resource directory, and the settings file is the one the bridge reported.
 *
 * Everywhere that is not the installed studio — a browser, a dev server, a
 * phone — there is nothing to call, and every function here says so rather than
 * throwing. The AI panel is shown in a dev server too, where pairing is manual
 * and this whole path is simply absent.
 */
export interface StudioBridgeReport {
  ready: boolean;
  running: boolean;
  url?: string;
  token?: string;
  error?: string;
  /** The settings file, as the bridge itself reported it. */
  settingsPath?: string;
}

export type StudioBridgeResult =
  | { available: true; report: StudioBridgeReport }
  | { available: true; failed: true; message: string }
  | { available: false };

const UNAVAILABLE: StudioBridgeResult = { available: false };

/**
 * Whether this window can talk to a bridge supervisor at all.
 *
 * Two conditions, and both matter: the page must be the installed studio — the
 * same origin the bridge policy and the platform check read — and Tauri's IPC
 * must actually be present. A studio built before the commands existed satisfies
 * the first and not the second.
 */
export function isStudioShell(
  origin = typeof window === 'undefined' ? '' : window.location.origin,
  hasIpc = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
): boolean {
  return isStudioOrigin(origin) && hasIpc;
}

/**
 * Imported only when it is going to be used.
 *
 * The module reaches for Tauri's IPC on load, and this file is bundled into the
 * web build and the player as well, where there is none.
 */
async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

async function call(command: string, args?: Record<string, unknown>): Promise<StudioBridgeResult> {
  if (!isStudioShell()) return UNAVAILABLE;
  try {
    return { available: true, report: await invokeCommand<StudioBridgeReport>(command, args) };
  } catch (error) {
    // The supervisor rejects with the bridge's own words — a missing API key, a
    // settings folder it could not protect. That message is the diagnosis, so it
    // is carried through rather than replaced with one of ours.
    return { available: true, failed: true, message: messageOf(error) };
  }
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'The AI bridge could not be started.';
}

export function startStudioBridge(): Promise<StudioBridgeResult> {
  return call('ai_bridge_start');
}

export function studioBridgeStatus(): Promise<StudioBridgeResult> {
  return call('ai_bridge_status');
}

export function stopStudioBridge(): Promise<StudioBridgeResult> {
  return call('ai_bridge_stop');
}

/**
 * Hands the author's provider and key to the bridge, and starts it again.
 *
 * The key goes page → command → the bridge's settings file. It is not stored by
 * the window: the caller is expected to forget it once this resolves, because
 * the only thing that ever needs it is the bridge.
 */
export function saveStudioBridgeSettings(
  provider: 'openai' | 'gemini',
  apiKey: string,
): Promise<StudioBridgeResult> {
  return call('ai_bridge_save_settings', { provider, apiKey });
}

/** The pairing details, when there are any to pair with. */
export function pairingFrom(result: StudioBridgeResult): { url: string; token: string } | null {
  if (!result.available || 'failed' in result) return null;
  const { url, token, ready } = result.report;
  return ready && url && token ? { url, token } : null;
}
