import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReaderControls } from '@/components/reader/ReaderControls';
import { mockColors } from './reader-test-utils';

const labels = {
  auto: 'Auto',
  log: 'Log',
  openHistory: 'Open history',
  skip: 'Skip',
  skipText: 'Fast skip',
  startAuto: 'Start auto',
  stopAuto: 'Stop auto',
  tapToContinue: 'Tap to continue',
};

describe('ReaderControls', () => {
  it('calls control callbacks and exposes accessible labels', () => {
    const onOpenHistory = vi.fn();
    const onSetTurbo = vi.fn();
    const onToggleAutoPlay = vi.fn();

    render(
      <ReaderControls
        autoPlayActive={false}
        canAdvance={true}
        colors={mockColors}
        hasChoices={false}
        isTyping={false}
        labels={labels}
        onOpenHistory={onOpenHistory}
        onSetTurbo={onSetTurbo}
        onToggleAutoPlay={onToggleAutoPlay}
        turbo={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: labels.startAuto }));
    fireEvent.click(screen.getByRole('button', { name: labels.openHistory }));
    fireEvent.mouseDown(screen.getByRole('button', { name: labels.skipText }));
    fireEvent.mouseUp(screen.getByRole('button', { name: labels.skipText }));

    expect(onToggleAutoPlay).toHaveBeenCalledTimes(1);
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onSetTurbo).toHaveBeenNthCalledWith(1, true);
    expect(onSetTurbo).toHaveBeenNthCalledWith(2, false);
    expect(screen.getByText(`${labels.tapToContinue} v`)).toBeTruthy();
  });

  it('uses stop auto accessibility label while autoplay is active', () => {
    render(
      <ReaderControls
        autoPlayActive={true}
        canAdvance={false}
        colors={mockColors}
        hasChoices={true}
        isTyping={false}
        labels={labels}
        onOpenHistory={vi.fn()}
        onSetTurbo={vi.fn()}
        onToggleAutoPlay={vi.fn()}
        turbo={false}
      />,
    );

    expect(screen.getByRole('button', { name: labels.stopAuto })).toBeTruthy();
    expect(screen.queryByText(`${labels.tapToContinue} v`)).toBeNull();
  });
});

