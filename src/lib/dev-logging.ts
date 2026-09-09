export function shouldLogDevDiagnostics(): boolean {
  return __DEV__ && process.env.NODE_ENV !== 'test';
}
