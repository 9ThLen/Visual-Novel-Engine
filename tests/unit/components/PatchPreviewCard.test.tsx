import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { PatchPreviewCard } from '@/components/ai-chat/PatchPreviewCard';
import type { ScenePatchDescription } from '@/lib/ai/scene-patch';
import type { TimelineStep } from '@/lib/engine/types';

function dialogueStep(id: string, text: string): TimelineStep {
  return {
    id,
    blockType: 'dialogue',
    collapsed: false,
    enabled: true,
    data: { entries: [{ id: `${id}-entry`, characterId: 'char-1', spriteId: 'default', text }], currentEntryIndex: 0 },
  };
}

function textStep(id: string, content: string): TimelineStep {
  return {
    id,
    blockType: 'text',
    collapsed: false,
    enabled: true,
    data: { content, typewriterSpeed: 30, anchorTo: 'background' },
  };
}

function buildDescription(): ScenePatchDescription {
  return {
    sceneId: 'scene-1',
    sceneName: 'Intro',
    changes: [
      { kind: 'step_added', step: dialogueStep('step-added', 'Hello there'), index: 1 },
      { kind: 'step_removed', step: dialogueStep('step-removed', 'Goodbye now') },
      { kind: 'step_changed', before: textStep('step-changed', 'Old narration'), after: textStep('step-changed', 'New narration') },
      { kind: 'metadata_changed', field: 'name', before: 'Old name', after: 'New name' },
      { kind: 'connection_changed', outputPort: 'default', before: 'scene-a', after: 'scene-b' },
    ],
    warnings: ['Character sprite missing'],
  };
}

describe('PatchPreviewCard', () => {
  it('renders every change kind, warnings, and wires apply/reject', () => {
    const onApply = vi.fn();
    const onReject = vi.fn();

    render(
      <PatchPreviewCard
        description={buildDescription()}
        explanation="Rewrite the active scene's dialogue"
        onApply={onApply}
        onReject={onReject}
      />,
    );

    expect(screen.getByText("Rewrite the active scene's dialogue")).toBeTruthy();
    expect(screen.getByText(/Hello there/)).toBeTruthy();
    expect(screen.getByText(/Goodbye now/)).toBeTruthy();
    expect(screen.getByText(/Old narration/)).toBeTruthy();
    expect(screen.getByText(/New narration/)).toBeTruthy();
    expect(screen.getByText(/Old name/)).toBeTruthy();
    expect(screen.getByText(/New name/)).toBeTruthy();
    expect(screen.getByText(/scene-a/)).toBeTruthy();
    expect(screen.getByText(/scene-b/)).toBeTruthy();
    expect(screen.getByText('Character sprite missing')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while applying', () => {
    render(
      <PatchPreviewCard
        description={buildDescription()}
        explanation="Rewrite"
        applying
        onApply={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveProperty('disabled', true);
  });
});
