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

let localSearchParams: Record<string, string> = {};

/** Route params are what a screen keys everything off; tests have to set them. */
export const setLocalSearchParamsForTests = (params: Record<string, string> = {}) => {
  localSearchParams = params;
};

export const useLocalSearchParams = () => localSearchParams;

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
