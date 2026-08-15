export function useEvent<T>(_target: unknown, _eventName: string, initialValue: T): T {
  return initialValue;
}

export function useEventListener(
  _target: unknown,
  _eventName: string,
  _listener: (...args: unknown[]) => void,
): void {}
