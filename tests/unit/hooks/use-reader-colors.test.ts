import { renderHook } from '@testing-library/react';
import { useColors } from '@/hooks/use-colors';
import { useReaderColors } from '@/hooks/use-reader-colors';
import { useAppStore } from '@/stores/use-app-store';

describe('useReaderColors', () => {
  afterEach(() => {
    useAppStore.setState({ storiesMetadata: [] });
  });

  it('merges the selected story theme and keeps unspecified palette tokens', () => {
    useAppStore.setState({
      storiesMetadata: [
        { id: 'story-a', theme: { dialogueBg: '#abcdef', choiceText: '#fedcba' } },
      ] as never,
    });

    const { result } = renderHook(() => ({ reader: useReaderColors('story-a'), base: useColors() }));

    expect(result.current.reader).toMatchObject({
      dialogueBg: '#abcdef',
      choiceText: '#fedcba',
      dialogueText: result.current.base.dialogueText,
      background: result.current.base.background,
    });
  });

  it('returns the base palette when the story has no theme', () => {
    useAppStore.setState({ storiesMetadata: [{ id: 'story-a' }] as never });

    const { result } = renderHook(() => ({ reader: useReaderColors('story-a'), base: useColors() }));

    expect(result.current.reader).toEqual(result.current.base);
  });

  it('does not leak one story theme into another story', () => {
    useAppStore.setState({
      storiesMetadata: [
        { id: 'story-a', theme: { dialogueBg: '#abcdef' } },
        { id: 'story-b' },
      ] as never,
    });

    const { result } = renderHook(() => ({ reader: useReaderColors('story-b'), base: useColors() }));

    expect(result.current.reader.dialogueBg).toBe(result.current.base.dialogueBg);
  });

  it('keeps the ReaderMenu palette unthemed when no story id is supplied', () => {
    useAppStore.setState({
      storiesMetadata: [
        { id: 'story-a', theme: { dialogueBg: '#abcdef' } },
      ] as never,
    });

    const { result } = renderHook(() => ({ reader: useReaderColors(undefined), base: useColors() }));

    expect(result.current.reader).toEqual(result.current.base);
    expect(result.current.reader.dialogueBg).not.toBe('#abcdef');
  });
});
