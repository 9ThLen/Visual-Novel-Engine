import { useEffect } from 'react';

export const useFocusEffect = (effect: () => void | (() => void)) => {
  useEffect(() => {
    return effect();
  }, [effect]);
};

export const useRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
});

export const useLocalSearchParams = () => ({});

export const Redirect = () => null;
export const Stack = {
  Screen: () => null,
};
export const Link = () => null;

export default {
  useFocusEffect,
  useRouter,
  useLocalSearchParams,
  Redirect,
  Stack,
  Link,
};
