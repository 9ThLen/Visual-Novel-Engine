import { useEffect } from 'react';

export const useFocusEffect = (effect: () => void | (() => void)) => {
  useEffect(() => {
    return effect();
  }, [effect]);
};

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
};

/**
 * One router for the whole suite, so a test can assert where a screen
 * navigated. Its calls persist between tests — clear it in `beforeEach` when
 * that matters.
 */
export const getRouterForTests = () => router;

export const useRouter = () => router;

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
