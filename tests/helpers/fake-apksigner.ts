/**
 * A stand-in for `apksigner`, so the suite runs on a machine without the
 * Android SDK.
 *
 * Making the real tool mandatory made the tests need it too, and a suite that
 * only passes where somebody happened to install build-tools is a suite whose
 * green means less than it says. The default here agrees with a correctly
 * signed artifact; the cases that care about disagreement say what they want.
 *
 * One test still runs the real tool and skips when it is absent, so this stub
 * cannot quietly drift away from what it stands for.
 */
import type { ApksignerVerdict } from '../../tools/vne-build/apksigner';

export function fakeApksigner(verdict: Partial<ApksignerVerdict> = {}) {
  return (): ApksignerVerdict => ({
    tool: 'fake-apksigner',
    verifies: true,
    schemes: ['v2'],
    fingerprints: [],
    output: 'Verifies',
    ...verdict,
  });
}

/** Agrees with whatever this repository's own reader concluded. */
export function agreeableApksigner(fingerprint: string) {
  return fakeApksigner({ fingerprints: [fingerprint] });
}
