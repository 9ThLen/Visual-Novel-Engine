import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReaderControls } from '@/components/reader/ReaderControls';
import { mockColors } from './reader-test-utils';

const labels = {
  auto: 'Auto',
  back: 'Back',
  goBack: 'Go back',
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
    const onBack = vi.fn();
    const onOpenHistory = vi.fn();
    const onSetTurbo = vi.fn();
    const onToggleAutoPlay = vi.fn();

    render(
      <ReaderControls
        autoPlayActive={false}
        canAdvance={true}
        canGoBack={true}
        colors={mockColors}
        hasChoices={false}
        isTyping={false}
        labels={labels}
        onBack={onBack}
        onOpenHistory={onOpenHistory}
        onSetTurbo={onSetTurbo}
        onToggleAutoPlay={onToggleAutoPlay}
        turbo={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: labels.startAuto }));
    fireEvent.click(screen.getByRole('button', { name: labels.openHistory }));
    fireEvent.click(screen.getByRole('button', { name: labels.goBack }));
    fireEvent.mouseDown(screen.getByRole('button', { name: labels.skipText }));
    fireEvent.mouseUp(screen.getByRole('button', { name: labels.skipText }));

    expect(onToggleAutoPlay).toHaveBeenCalledTimes(1);
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSetTurbo).toHaveBeenNthCalledWith(1, true);
    expect(onSetTurbo).toHaveBeenNthCalledWith(2, false);
    expect(screen.getByText(`${labels.tapToContinue} v`)).toBeTruthy();
  });

  it('does not fire onBack while rollback is unavailable', () => {
    const onBack = vi.fn();

    render(
      <ReaderControls
        autoPlayActive={false}
        canAdvance={true}
        canGoBack={false}
        colors={mockColors}
        hasChoices={false}
        isTyping={false}
        labels={labels}
        onBack={onBack}
        onOpenHistory={vi.fn()}
        onSetTurbo={vi.fn()}
        onToggleAutoPlay={vi.fn()}
        turbo={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: labels.goBack }));
    expect(onBack).not.toHaveBeenCalled();
  });

  it('uses stop auto accessibility label while autoplay is active', () => {
    render(
      <ReaderControls
        autoPlayActive={true}
        canAdvance={false}
        canGoBack={false}
        colors={mockColors}
        hasChoices={true}
        isTyping={false}
        labels={labels}
        onBack={vi.fn()}
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

