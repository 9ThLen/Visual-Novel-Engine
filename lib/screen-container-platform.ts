import { cn } from '@/lib/utils';

type WrapperClassNameOptions = {
  platformOS: string;
  containerClassName?: string;
  safeAreaClassName?: string;
};

export function getScreenContainerWrapperClassNames({
  platformOS,
  containerClassName,
  safeAreaClassName,
}: WrapperClassNameOptions) {
  if (platformOS === 'web') {
    return {
      containerClassName: undefined,
      safeAreaClassName: undefined,
    };
  }

  return {
    containerClassName: cn('flex-1', containerClassName),
    safeAreaClassName: cn('flex-1', safeAreaClassName),
  };
}

export function getScreenContainerWrapperStyles() {
  return {
    containerStyle: { flex: 1 },
    safeAreaStyle: { flex: 1 },
  };
}
