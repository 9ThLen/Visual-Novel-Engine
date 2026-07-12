/**
 * Background removal (web).
 *
 * Cuts the background out of an image with the ISNet segmentation model via
 * @imgly/background-removal (ONNX Runtime on WASM). Metro cannot bundle
 * onnxruntime-web (it contains dynamic import(variable) calls Metro rejects),
 * so the library is loaded at runtime as a native ES module from the CDN,
 * bypassing the bundler entirely. Model weights (~40 MB) are fetched from the
 * imgly CDN on first use and cached by the browser. The npm package stays in
 * dependencies only for its TypeScript types.
 */

/** Progress callback: `key` names the phase (fetch:…/compute:…), current/total are byte or step counts. */
export type BackgroundRemovalProgress = (key: string, current: number, total: number) => void;

export function isBackgroundRemovalSupported(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

type BackgroundRemovalModule = typeof import('@imgly/background-removal');

// Keep the version in sync with @imgly/background-removal in package.json.
const CDN_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

// `import(url)` must be hidden from Metro — written literally it fails the
// build the same way onnxruntime-web does.
const nativeImport = new Function('url', 'return import(url)') as (url: string) => Promise<BackgroundRemovalModule>;

let moduleLoader: () => Promise<BackgroundRemovalModule> = () => nativeImport(CDN_MODULE_URL);
let modulePromise: Promise<BackgroundRemovalModule> | null = null;

/** Test seam: replace the CDN loader with a stub module. */
export function setBackgroundRemovalModuleLoaderForTests(loader: () => Promise<BackgroundRemovalModule>): void {
  moduleLoader = loader;
  modulePromise = null;
}

function loadModule(): Promise<BackgroundRemovalModule> {
  if (!modulePromise) {
    modulePromise = moduleLoader().catch((error) => {
      // A failed chunk load (offline, CDN hiccup) must not poison later retries.
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result) resolve(reader.result);
      else reject(new Error('Failed to encode background removal result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode background removal result'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Remove the background from an image and return a transparent PNG data: URI.
 * Accepts any URI fetch() can load (data:, blob:, http…). Throws on failure —
 * callers surface the error and keep the original image.
 */
export async function removeImageBackground(
  imageUri: string,
  onProgress?: BackgroundRemovalProgress,
): Promise<string> {
  const { removeBackground } = await loadModule();
  const blob = await removeBackground(imageUri, {
    // The CDN bundle cannot spawn its own module worker (its code is not a
    // separate file), so inference runs on the calling thread.
    proxyToWorker: false,
    output: { format: 'image/png' },
    progress: onProgress,
  });
  return blobToDataUrl(blob);
}
