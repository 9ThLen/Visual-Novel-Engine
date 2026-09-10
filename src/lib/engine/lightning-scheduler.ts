export interface LightningStrike {
  id: number;
}

export type LightningListener = (strike: LightningStrike) => void;

export interface LightningSubscriptionOptions {
  /** Fallout-style rapid flashes instead of the default storm cadence. */
  fast?: boolean;
}

// Single shared timer so the visual flash (web + native renderers) and the
// thunder sound fire from the same strike event.
const listeners = new Map<LightningListener, LightningSubscriptionOptions>();
let timer: ReturnType<typeof setTimeout> | null = null;
let counter = 0;

const STORM_DELAY_MS: [number, number] = [2800, 8200];
const FAST_DELAY_MS: [number, number] = [900, 2600];

function nextDelayMs(): number {
  const fast = Array.from(listeners.values()).some((options) => options.fast);
  const [min, max] = fast ? FAST_DELAY_MS : STORM_DELAY_MS;
  return min + Math.random() * (max - min);
}

function scheduleNextStrike(): void {
  timer = setTimeout(() => {
    counter += 1;
    const strike: LightningStrike = { id: counter };
    listeners.forEach((_options, listener) => listener(strike));
    if (listeners.size > 0) scheduleNextStrike();
    else timer = null;
  }, nextDelayMs());
}

export function subscribeToLightning(
  listener: LightningListener,
  options: LightningSubscriptionOptions = {},
): () => void {
  listeners.set(listener, options);
  if (!timer) scheduleNextStrike();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export function hasLightningSubscribers(): boolean {
  return listeners.size > 0;
}
