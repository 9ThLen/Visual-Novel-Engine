import {
  getScreenContainerWrapperClassNames,
  getScreenContainerWrapperStyles,
} from '@/lib/screen-container-platform';

describe('screen container platform helpers', () => {
  it('avoids wrapper className interop on web', () => {
    expect(
      getScreenContainerWrapperClassNames({
        platformOS: 'web',
        containerClassName: 'bg-red-500',
        safeAreaClassName: 'pt-4',
      }),
    ).toEqual({
      containerClassName: undefined,
      safeAreaClassName: undefined,
    });
  });

  it('keeps wrapper className interop on native', () => {
    expect(
      getScreenContainerWrapperClassNames({
        platformOS: 'android',
        containerClassName: 'bg-red-500',
        safeAreaClassName: 'pt-4',
      }),
    ).toEqual({
      containerClassName: 'flex-1 bg-red-500',
      safeAreaClassName: 'flex-1 pt-4',
    });
  });

  it('returns flex wrappers for all platforms', () => {
    expect(getScreenContainerWrapperStyles()).toEqual({
      containerStyle: { flex: 1 },
      safeAreaStyle: { flex: 1 },
    });
  });
});
