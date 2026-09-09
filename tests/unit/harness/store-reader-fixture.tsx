/** A store reader living in its own module, imported by the harness probe. */
import React from 'react';

import { useAppStore } from '@/stores/use-app-store';

export function FixtureStoreReader() {
  const title = (useAppStore as unknown as <T>(selector: (state: Record<string, unknown>) => T) => T)(
    (state) => state.probeTitle as string | undefined,
  );
  return <span data-testid="fixture-probe">{title ?? 'unset'}</span>;
}
