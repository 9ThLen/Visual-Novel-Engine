import { renderHook } from '@testing-library/react';
import { useCharacterAnimations } from '@/hooks/useCharacterAnimations';

describe('useCharacterAnimations', () => {
  it('hides a character and makes the same character visible on the next show', () => {
    const { result, rerender } = renderHook(
      ({ visible }) => useCharacterAnimations([{
        characterId: 'hero',
        visible,
        entranceTransition: 'instant',
        exitTransition: 'instant',
      }]),
      { initialProps: { visible: true } },
    );
    const opacity = result.current.getAnimValues('hero').opacity;
    const setOpacity = vi.spyOn(opacity, 'setValue');

    rerender({ visible: false });
    expect(setOpacity).toHaveBeenCalledWith(0);

    setOpacity.mockClear();
    rerender({ visible: true });
    expect(setOpacity).toHaveBeenCalledWith(1);
  });
});
