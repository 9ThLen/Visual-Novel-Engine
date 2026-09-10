// @vitest-environment node
import { fetchWithProviderRetry } from '../../tools/ai-bridge/src/provider-retry';

describe('provider retry policy', () => {
  it('uses exponential backoff with bounded jitter', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const pending = fetchWithProviderRetry({
      signal: new AbortController().signal,
      canRetry: () => true,
      attempt,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      random: () => 0.5,
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(attempt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(attempt).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('stops before another attempt when replay becomes unsafe', async () => {
    const canRetry = vi.fn().mockReturnValue(false);
    const attempt = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    await expect(fetchWithProviderRetry({
      signal: new AbortController().signal,
      canRetry,
      attempt,
      baseDelayMs: 0,
    })).resolves.toMatchObject({ status: 503 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After beyond the exponential backoff cap', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '60' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const pending = fetchWithProviderRetry({
      signal: new AbortController().signal,
      canRetry: () => true,
      attempt,
      baseDelayMs: 100,
      maxDelayMs: 5_000,
    });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(attempt).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('caps jittered exponential backoff at maxDelayMs', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const pending = fetchWithProviderRetry({
      signal: new AbortController().signal,
      canRetry: () => true,
      attempt,
      baseDelayMs: 1_000,
      maxDelayMs: 1_000,
      random: () => 1,
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ status: 200 });
    vi.useRealTimers();
  });

  it('can be aborted while waiting to retry', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const attempt = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    const pending = fetchWithProviderRetry({
      signal: controller.signal,
      canRetry: () => true,
      attempt,
      baseDelayMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(attempt).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
