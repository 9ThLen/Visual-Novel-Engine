import { subscribeToLightning, hasLightningSubscribers } from '@/lib/engine/lightning-scheduler';

describe('lightning-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits strikes while subscribed and stops after unsubscribe', () => {
    const strikes: number[] = [];
    const unsubscribe = subscribeToLightning((strike) => strikes.push(strike.id));

    vi.advanceTimersByTime(9000);
    expect(strikes.length).toBeGreaterThanOrEqual(1);

    unsubscribe();
    expect(hasLightningSubscribers()).toBe(false);

    const seen = strikes.length;
    vi.advanceTimersByTime(30000);
    expect(strikes.length).toBe(seen);
  });

  it('delivers the same strike to every subscriber', () => {
    const first: number[] = [];
    const second: number[] = [];
    const unsubscribeFirst = subscribeToLightning((strike) => first.push(strike.id));
    const unsubscribeSecond = subscribeToLightning((strike) => second.push(strike.id));

    vi.advanceTimersByTime(9000);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first).toEqual(second);

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it('uses the faster cadence when a fast subscriber is present', () => {
    const strikes: number[] = [];
    const unsubscribe = subscribeToLightning((strike) => strikes.push(strike.id), { fast: true });

    // Fast cadence fires at most every 2.6s, so 11s guarantees several strikes.
    vi.advanceTimersByTime(11000);
    expect(strikes.length).toBeGreaterThanOrEqual(3);

    unsubscribe();
  });
});
