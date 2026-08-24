/**
 * Module identity across the harness.
 *
 * This file exists because two store-backed screens could not be mounted in
 * tests, and the suspected cause was a split registry: Vite aliases in
 * `vitest.config.ts` versus the hand-rolled Node loader in `vitest.setup.ts`.
 *
 * These tests DISPROVED that theory — every path below yields the same module
 * instance. The real causes were mundane: a router mock that always returned
 * empty route params, and an editor mock whose `onChange` used the wrong
 * signature. The file stays as a regression guard, and as a record that the
 * registry is not where to look next time a screen refuses to see the store.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import StoryGalleryRoute from '@/app/story-gallery';
import { useAppStore } from '@/stores/use-app-store';
import { FixtureStoreReader } from './store-reader-fixture';
import { setLocalSearchParamsForTests } from '../../../__mocks__/expo-router';
import * as storeFromMockPath from '../../../__mocks__/stores/use-app-store';

type ProbeStore = {
  <T>(selector: (state: Record<string, unknown>) => T): T;
  setState: (value: Record<string, unknown>) => void;
  getState: () => Record<string, unknown>;
};

const probeStore = useAppStore as unknown as ProbeStore;

/** Reads the store the way application code does. */
function StoreReader() {
  const title = probeStore((state) => state.probeTitle as string | undefined);
  return <span data-testid="probe">{title ?? 'unset'}</span>;
}

describe('harness module identity', () => {
  it('gives the test and the component the same store module', () => {
    probeStore.setState({ probeTitle: 'seeded-by-test' });

    render(<StoreReader />);

    expect(screen.getByTestId('probe').textContent).toBe('seeded-by-test');
  });

  // Importing through the alias and through the relative mock path must not
  // produce two copies: seeding one has to be visible through the other.
  it('gives the alias and the direct mock path the same store module', () => {
    (storeFromMockPath.useAppStore as unknown as ProbeStore)
      .setState({ probeTitle: 'seeded-through-mock-path' });

    expect(probeStore.getState().probeTitle).toBe('seeded-through-mock-path');
  });

  // A reader in its own module: this is the shape that matters, because every
  // screen is a separate module pulled in through the loader.
  it('gives a component from another module the same store', () => {
    probeStore.setState({ probeTitle: 'seeded-for-fixture' });

    render(<FixtureStoreReader />);

    expect(screen.getByTestId('fixture-probe').textContent).toBe('seeded-for-fixture');
  });

  // The real case: a route module. Until this passes, no store-backed screen can
  // be tested, which is what blocks the media library and the editor.
  it('gives a route module the same store', () => {
    setLocalSearchParamsForTests({ storyId: 'story-1' });
    probeStore.setState({
      storiesMetadata: [{ id: 'story-1', title: 'Seeded story', startSceneId: 's', createdAt: 1, updatedAt: 1, sceneCount: 0 }],
      sceneRecordsByStory: {},
      mediaLibrary: [],
      imageAssetIdsByStory: {},
      mediaAssetIdsByStory: {},
      characterLibraries: {},
      hydrateSceneRecordsForStory: async () => {},
    });

    render(<StoryGalleryRoute />);

    expect(screen.queryByText('Seeded story')).not.toBeNull();
  });
});
