export function useEvent<T>(_target: unknown, _eventName: string, initialValue: T): T {
  return initialValue;
}

export function useEventListener(
  _target: unknown,
  _eventName: string,
  _listener: (...args: unknown[]) => void,
): void {}

/** Native modules never exist under jsdom; every caller handles a null module. */
export function requireOptionalNativeModule(_name: string): null {
  return null;
}

export function requireNativeModule(_name: string): null {
  return null;
}
