import React from 'react';
import { act, render } from '@testing-library/react';
import { SceneVideoLayer } from '@/components/reader/SceneVideoLayer';
import type { RuntimeVideoState } from '@/lib/engine/runtime-types';

function videoState(overrides: Partial<RuntimeVideoState> = {}): RuntimeVideoState {
  return {
    stepId: 'step_video',
    assetId: 'video_intro',
    posterAssetId: null,
    layer: 'background',
    fit: 'cover',
    playbackRate: 1,
    startAt: 0,
    endAt: null,
    muted: true,
    volume: 0,
    loop: true,
    skippableAfterMs: null,
    ...overrides,
  } as RuntimeVideoState;
}

async function renderLayer(video = videoState()) {
  const view = render(<SceneVideoLayer video={video} />);
  // The asset URI resolves on a promise; the player only mounts after it lands.
  await act(async () => { await Promise.resolve(); });
  return view;
}

describe('SceneVideoLayer', () => {
  it('tells the clip to fill the layer instead of leaving it at its own size', async () => {
    const { container } = await renderLayer();
    const player = container.querySelector('VideoView');
    expect(player).not.toBeNull();

    // On web the style lands on a bare <video>. An absolutely positioned
    // replaced element keeps its intrinsic size when width is auto — the insets
    // are ignored — so without these the clip paints at its own resolution in
    // the corner and contentFit has nothing to crop.
    const style = (player as HTMLElement).style;
    expect(style.width).toBe('100%');
    expect(style.height).toBe('100%');
    expect(style.position).toBe('absolute');
  });

  it('passes the authored fit through to the player', async () => {
    const { container } = await renderLayer(videoState({ fit: 'contain' }));
    expect(container.querySelector('VideoView')?.getAttribute('contentFit')).toBe('contain');
  });
});
