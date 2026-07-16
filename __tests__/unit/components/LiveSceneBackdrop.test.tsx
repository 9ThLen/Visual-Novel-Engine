import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Text } from 'react-native';

import { LiveSceneBackdrop } from '@/components/showcase/LiveSceneBackdrop';
import { fallbackColorForSeed } from '@/lib/showcase/story-showcase';

describe('LiveSceneBackdrop', () => {
  it('renders its children over the frame', () => {
    render(
      <LiveSceneBackdrop backgroundAsset={null} effect={null} fallbackSeed="story-1" fallbackLabel="Dune" height={400}>
        <Text>Continue reading</Text>
      </LiveSceneBackdrop>,
    );

    expect(screen.getByText('Continue reading')).toBeTruthy();
  });

  it('shows an image only when there is a background', async () => {
    const { container, rerender } = render(
      <LiveSceneBackdrop backgroundAsset={null} effect={null} fallbackSeed="story-1" fallbackLabel="Dune" height={400} />,
    );
    expect(container.querySelector('img')).toBeNull();

    rerender(
      <LiveSceneBackdrop backgroundAsset="asset://bg" effect={null} fallbackSeed="story-1" fallbackLabel="Dune" height={400} />,
    );
    // The asset reference resolves asynchronously, like scene art in the reader.
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  });

  it('falls back to a deterministic colour and the title initial', () => {
    const { container } = render(
      <LiveSceneBackdrop backgroundAsset={null} effect={null} fallbackSeed="dune" fallbackLabel="Dune" height={400} />,
    );

    // jsdom reports colours as rgb(), so compare against the resolved seed colour.
    const hex = fallbackColorForSeed('dune').replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

    expect(screen.getByText('D')).toBeTruthy();
    expect(container.innerHTML).toContain(`rgb(${rgb})`);
  });
});
