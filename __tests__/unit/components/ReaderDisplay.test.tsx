import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReaderDisplay } from '@/components/reader/ReaderDisplay';
import { mockColors, ReaderControlsStub } from './reader-test-utils';

const baseProps = {
  backgroundAnimatedStyle: {},
  bgSource: null,
  characterAnimatedStyle: {},
  choices: [],
  colors: mockColors,
  dialogueAnimatedStyle: {},
  dialogueFontSize: 16,
  displayedText: 'The room is quiet.',
  fallbackColor: '#000000',
  getChoiceAccessibilityLabel: (text: string) => `Choose ${text}`,
  continueAccessibilityLabel: 'Continue story',
  continueAccessibilityHint: 'Advance to the next line',
  isTyping: false,
  isLoading: false,
  onTap: vi.fn(),
  onSelectChoice: vi.fn(),
  paddingBottom: 24,
  pagesLength: 1,
  pageIndex: 0,
  readerControls: <ReaderControlsStub />,
  resolvedCharUris: {},
  speaker: 'Narrator',
  speakerTextStyle: { color: '#ffffff' },
  instances: [],
};

describe('ReaderDisplay', () => {
  it('renders dialogue content and calls onTap from the tappable story area', () => {
    const onTap = vi.fn();

    render(<ReaderDisplay {...baseProps} onTap={onTap} />);

    expect(screen.getByText('Narrator')).toBeTruthy();
    expect(screen.getByText('The room is quiet.')).toBeTruthy();
    expect(screen.getByTestId('reader-controls')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue story' }));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('calls onTap when the dialogue panel is pressed', () => {
    const onTap = vi.fn();

    render(<ReaderDisplay {...baseProps} onTap={onTap} />);

    fireEvent.click(screen.getByText('The room is quiet.'));

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('renders choices after typing completes and selects by choice id', () => {
    const onSelectChoice = vi.fn();

    render(
      <ReaderDisplay
        {...baseProps}
        choices={[
          { id: 'left', text: 'Go left', targetSceneId: 'left-scene', nextSceneId: 'left-scene', index: 0 },
          { id: 'right', text: 'Go right', targetSceneId: 'right-scene', nextSceneId: 'right-scene', index: 1 },
        ]}
        onSelectChoice={onSelectChoice}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose Go right' }));

    expect(onSelectChoice).toHaveBeenCalledWith('right');
  });

  it('does not render choices while text is typing', () => {
    render(
      <ReaderDisplay
        {...baseProps}
        choices={[{ id: 'left', text: 'Go left', targetSceneId: 'left-scene', nextSceneId: 'left-scene', index: 0 }]}
        isTyping={true}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Choose Go left' })).toBeNull();
    expect(screen.getByText('|')).toBeTruthy();
  });

  it('renders the weather effects layer for active rain effects', () => {
    const now = Date.now();

    render(
      <ReaderDisplay
        {...baseProps}
        activeEffects={[
          {
            effectType: 'rain',
            target: 'screen',
            intensity: 70,
            startTime: now,
            endTime: now + 8000,
            rain: { density: 12 },
          },
        ]}
      />,
    );

    expect(screen.getByTestId('weather-effects-layer')).toBeTruthy();
  });
});
