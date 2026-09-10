import { isStudioOrigin } from '@/lib/ai/studio-origins';
import { normalizeLocalBridgeUrl } from '@/lib/ai/bridge-config';
import type { BridgeProvider } from '@/lib/bridge-protocol';

/**
 * How this copy of the studio is being run, and therefore how its author starts
 * a bridge.
 *
 * The panel used to print `pnpm ai-bridge …` unconditionally. In a checkout that
 * is exactly right. In the installed studio it is a command for a package
 * manager that is not installed, in a repository that was never cloned — and it
 * is the only instruction the author is given, so the feature reads as broken
 * rather than as unconfigured.
 *
 * The two are told apart by the origin the window is served from, which is the
 * same signal the bridge and the platform check already use.
 */
export type BridgeLaunchInstruction =
  | { kind: 'checkout'; command: string }
  | { kind: 'packaged'; command: string };

export interface BridgeLaunchInput {
  /** `window.location.origin`. */
  origin: string;
  provider: BridgeProvider;
  imageProvider: string;
  /** The bridge URL as typed, used only to carry across a non-default port. */
  url: string;
}

/** The launcher `scripts/lib/stage-bridge-package.ts` writes into the package. */
export const PACKAGED_LAUNCHER = 'Start AI Bridge.cmd';

const DEFAULT_PORT = '8787';

function portFlag(url: string): string {
  const normalized = normalizeLocalBridgeUrl(url);
  if (!normalized.ok) return '';
  const port = new URL(normalized.url).port;
  return port && port !== DEFAULT_PORT ? ` --port ${port}` : '';
}

export function bridgeLaunchInstruction(input: BridgeLaunchInput): BridgeLaunchInstruction {
  const flags = `--provider ${input.provider} --image-provider ${input.imageProvider}`
    + (input.provider === 'codex' ? ' --enable-codex-beta' : '')
    + portFlag(input.url);

  if (isStudioOrigin(input.origin)) {
    // No `--origin`: this window's origin is in the bridge's defaults, and a
    // flag the author has to retype correctly is one more way to fail.
    return { kind: 'packaged', command: `"${PACKAGED_LAUNCHER}" ${flags}` };
  }

  // A dev server is reached on a port that is not in the defaults, so it says so.
  const originFlag = input.origin.startsWith('http://') || input.origin.startsWith('https://')
    ? ` --origin ${input.origin}`
    : '';
  return { kind: 'checkout', command: `pnpm ai-bridge ${flags}${originFlag}` };
}
