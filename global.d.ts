/// <reference types="vitest/globals" />

declare module '*.png' {
  const value: number;
  export default value;
}

declare module '*.jpg' {
  const value: number;
  export default value;
}

declare module '*.mp3' {
  const value: number;
  export default value;
}

declare module '*.ogg' {
  const value: number;
  export default value;
}

declare module '*.wav' {
  const value: number;
  export default value;
}

declare const __DEV__: boolean;

declare interface Buffer extends Uint8Array {
  toString(encoding?: string): string;
}

declare const Buffer: {
  from(data: string, encoding?: string): Buffer;
  from(data: Uint8Array): Buffer;
};
