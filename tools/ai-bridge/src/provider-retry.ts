import { ProviderFailure } from './provider';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface ProviderRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Caps exponential backoff. A server-provided Retry-After may be longer. */
  maxDelayMs?: number;
  random?: () => number;
}

export interface RetryFetchOptions extends ProviderRetryOptions {
  signal: AbortSignal;
  canRetry: () => boolean;
  attempt: () => Promise<Response>;
  isRetryableError?: (error: unknown) => boolean;
}

/** Retries only failures that happen before an HTTP response body is consumed. */
export async function fetchWithProviderRetry(options: RetryFetchOptions): Promise<Response> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 5_000);
  const random = options.random ?? Math.random;

  for (let attemptIndex = 0; ; attemptIndex += 1) {
    let response: Response;
    try {
      response = await options.attempt();
    } catch (error) {
      if (options.signal.aborted || isAbortError(error)) throw error;
      const retryable = options.isRetryableError?.(error) ?? !(error instanceof ProviderFailure);
      if (!retryable || attemptIndex + 1 >= maxAttempts || !options.canRetry()) throw error;
      await abortableDelay(jitteredDelay(attemptIndex, baseDelayMs, maxDelayMs, random), options.signal);
      continue;
    }

    if (!RETRYABLE_STATUSES.has(response.status)
      || attemptIndex + 1 >= maxAttempts
      || !options.canRetry()) return response;

    const delayMs = Math.max(
      retryAfterMs(response.headers.get('retry-after')) ?? 0,
      jitteredDelay(attemptIndex, baseDelayMs, maxDelayMs, random),
    );
    await cancelBody(response);
    await abortableDelay(delayMs, options.signal);
  }
}

function jitteredDelay(attemptIndex: number, baseDelayMs: number, maxDelayMs: number, random: () => number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** attemptIndex));
  const jitter = 0.5 + Math.min(1, Math.max(0, random()));
  return Math.min(maxDelayMs, Math.round(exponential * jitter));
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function cancelBody(response: Response): Promise<void> {
  try { await response.body?.cancel(); } catch { /* already consumed */ }
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = (): void => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): DOMException { return new DOMException('Turn aborted', 'AbortError'); }
function isAbortError(error: unknown): boolean { return error instanceof Error && error.name === 'AbortError'; }
