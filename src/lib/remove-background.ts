/**
 * Background removal (native fallback).
 *
 * The real implementation lives in remove-background.web.ts and runs the
 * ISNet ONNX model in the browser via @imgly/background-removal. There is no
 * native runtime for it, so on iOS/Android the feature reports unsupported
 * and callers must hide their UI behind isBackgroundRemovalSupported().
 */

/** Progress callback: `key` names the phase (fetch:…/compute:…), current/total are byte or step counts. */
export type BackgroundRemovalProgress = (key: string, current: number, total: number) => void;

export function isBackgroundRemovalSupported(): boolean {
  return false;
}

export async function removeImageBackground(
  _imageUri: string,
  _onProgress?: BackgroundRemovalProgress,
): Promise<string> {
  throw new Error('Background removal is only available on web');
}
