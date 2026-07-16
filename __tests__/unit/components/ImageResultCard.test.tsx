import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ImageResultCard } from '@/components/ai-chat/ImageResultCard';
import type { AiImageResult } from '@/lib/ai/image-tools';
import { useAppStore } from '@/stores/use-app-store';

const importAsset = vi.fn();

const result: AiImageResult = {
  requestId: 'result-1', purpose: 'generated', prompt: 'A misty forest', mimeType: 'image/webp',
  blob: new Blob(['image'], { type: 'image/webp' }), blobUrl: 'blob:preview', width: 512, height: 512,
  estimatedCostUsd: { min: 0.02, max: 0.04 },
};

describe('ImageResultCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ mediaLibrary: [], imageAssetIdsByStory: {} });
    useAppStore.getState().addImageAssetToStory = vi.fn((storyId: string, assetId: string) => {
      useAppStore.setState({ imageAssetIdsByStory: { [storyId]: [assetId] } });
    });
    importAsset.mockResolvedValue({ id: 'asset-1', type: 'image', uri: 'idb://media/1', name: 'ai.webp', addedAt: 1 });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders metadata and imports through both real store layers only after the press', async () => {
    const onImported = vi.fn();
    render(<ImageResultCard result={result} storyId="story-1" onImported={onImported} onDiscard={vi.fn()} importAsset={importAsset} />);
    expect(screen.getByText('A misty forest')).toBeTruthy();
    expect(importAsset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add to story images' }));
    await waitFor(() => expect(importAsset).toHaveBeenCalledWith('blob:preview', 'ai-image-result-1.webp', 'image'));
    expect(useAppStore.getState().addImageAssetToStory).toHaveBeenCalledWith('story-1', 'asset-1');
    expect(useAppStore.getState().imageAssetIdsByStory['story-1']).toEqual(['asset-1']);
    expect(onImported).toHaveBeenCalledWith('asset-1');
  });

  it('discards without importing and revokes the Blob URL on removal', () => {
    const onDiscard = vi.fn();
    const rendered = render(<ImageResultCard result={result} storyId="story-1" onImported={vi.fn()} onDiscard={onDiscard} importAsset={importAsset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(importAsset).not.toHaveBeenCalled();
    rendered.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('keeps the durable card retryable when import fails', async () => {
    importAsset.mockRejectedValueOnce(new Error('storage full'));
    const onImported = vi.fn();
    render(<ImageResultCard result={result} storyId="story-1" onImported={onImported} onDiscard={vi.fn()} importAsset={importAsset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to story images' }));

    expect((await screen.findByRole('alert')).textContent).toContain('storage full');
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add to story images' }).getAttribute('disabled')).toBeNull();
  });
});
