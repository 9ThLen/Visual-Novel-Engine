import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ChangeSetPreviewCard } from '@/components/ai-chat/ChangeSetPreviewCard';
import type { AiChangeSetDescription } from '@/lib/ai/change-set';
import type { TimelineStep } from '@/lib/engine/types';

const textStep = (id: string, content: string): TimelineStep => ({
  id, blockType: 'text', collapsed: false, enabled: true,
  data: { content, typewriterSpeed: 30, anchorTo: 'background' },
});

const description: AiChangeSetDescription = {
  scenes: [
    { kind: 'created', sceneRef: 'new:escape', name: 'Escape', stepCount: 3, teaser: 'We have to run.' },
    { kind: 'modified', sceneRef: 'Intro', changes: [
      { kind: 'step_added', step: textStep('new-step', 'The door opens'), index: 1 },
      { kind: 'step_changed', before: textStep('old-step', 'Wait'), after: textStep('old-step', 'Run') },
    ] },
  ],
  connections: [{ sceneRef: 'Intro', targetRef: 'new:escape', outputPort: 'option-run', label: 'Run away' }],
  characters: [{ kind: 'created', ref: 'newchar:guard', name: 'Guard' }],
  warnings: ['Start scene is unchanged'],
};

describe('ChangeSetPreviewCard', () => {
  it('renders created, modified, choice and character sections and wires actions', () => {
    const onApply = vi.fn();
    const onReject = vi.fn();
    render(<ChangeSetPreviewCard description={description} explanation="Create an escape branch" onApply={onApply} onReject={onReject} />);

    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByText('Escape')).toBeTruthy();
    expect(screen.getByText('We have to run.')).toBeTruthy();
    expect(screen.getByText(/The door opens/)).toBeTruthy();
    expect(screen.getByText(/Wait.*Run/)).toBeTruthy();
    expect(screen.getByText("Intro → new:escape via choice 'Run away'")).toBeTruthy();
    expect(screen.getByText('NEW: Guard')).toBeTruthy();
    expect(screen.getByText('Start scene is unchanged')).toBeTruthy();
    expect(screen.getByText('1 scenes created, 1 modified, 1 links')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('collapses a scene and only offers rollback for the applicable journal entry', () => {
    const onRollback = vi.fn();
    render(<ChangeSetPreviewCard description={description} explanation="Applied" applied canRollback onApply={vi.fn()} onReject={vi.fn()} onRollback={onRollback} />);

    fireEvent.click(screen.getByRole('button', { name: /Escape/ }));
    expect(screen.queryByText('We have to run.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Undo AI changes|Rollback/ }));
    expect(onRollback).toHaveBeenCalledTimes(1);
  });
});
