import { describe, expect, it } from 'vitest';

import { applyPreviewStepState, createPreviewSceneState } from '@/lib/preview-step-state';

describe('preview-step-state', () => {
  it('stores background asset ids from background steps', () => {
    const result = applyPreviewStepState(
      createPreviewSceneState(),
      {
        blockType: 'background',
        data: { assetId: 'bg-1' },
      },
    );

    expect(result.background).toBe('bg-1');
  });

  it('starts music for play actions and clears it for stop actions', () => {
    const playing = applyPreviewStepState(
      createPreviewSceneState(),
      {
        blockType: 'music',
        data: { assetId: 'track-1', action: 'play' },
      },
    );

    const stopped = applyPreviewStepState(playing, {
      blockType: 'music',
      data: { action: 'stop' },
    });

    expect(playing.music).toBe('track-1');
    expect(stopped.music).toBeNull();
  });

  it('appends character entries from character steps', () => {
    const result = applyPreviewStepState(
      createPreviewSceneState(),
      {
        blockType: 'character',
        data: { characterId: 'hero', spriteId: 'hero-smile', position: 'left' },
      },
    );

    expect(result.characters).toEqual([
      { id: 'hero', sprite: 'hero-smile', position: 'left' },
    ]);
  });
});
