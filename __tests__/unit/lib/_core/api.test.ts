describe('API Rate Limiting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rejects the eleventh request to one endpoint within a second', async () => {
    const { apiCall } = await import('@/lib/_core/api');
    for (let request = 0; request < 10; request += 1) {
      await apiCall('/api/story');
    }

    await expect(apiCall('/api/story')).rejects.toThrow('Rate limit exceeded');
    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it('allows the endpoint again after its rate-limit window', async () => {
    const { apiCall } = await import('@/lib/_core/api');
    for (let request = 0; request < 10; request += 1) await apiCall('/api/story');
    vi.advanceTimersByTime(1_001);

    await expect(apiCall('/api/story')).resolves.toEqual({});
  });
});
