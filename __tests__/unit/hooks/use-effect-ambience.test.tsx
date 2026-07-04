import { renderHook, act } from '@testing-library/react';
import { useEffectAmbience } from '@/hooks/useEffectAmbience';
import { enhancedAudioManager } from '@/lib/audio-manager-enhanced';
import { RAIN_AMBIENCE_TRACK_ID, THUNDER_TRACK_PREFIX } from '@/lib/effect-audio';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

function rainEffect(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  const now = Date.now();
  return {
    effectType: 'rain',
    target: 'screen',
    intensity: 60,
    startTime: now,
    endTime: now + 30000,
    ...overrides,
  };
}

async function flushAsync() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useEffectAmbience', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the rain loop for an active rain effect and stops on unmount', async () => {
    const { unmount } = renderHook(() =>
      useEffectAmbience([rainEffect()], 1),
    );
    await flushAsync();

    expect(enhancedAudioManager.play).toHaveBeenCalledWith(
      RAIN_AMBIENCE_TRACK_ID,
      expect.any(String),
      expect.objectContaining({ loop: true }),
    );

    unmount();
    expect(enhancedAudioManager.stop).toHaveBeenCalledWith(RAIN_AMBIENCE_TRACK_ID, expect.any(Number));
  });

  it('does not play when the effect disables sound or hook is disabled', async () => {
    renderHook(() => useEffectAmbience([rainEffect({ rain: { sound: false } })], 1));
    await flushAsync();
    expect(enhancedAudioManager.play).not.toHaveBeenCalled();

    renderHook(() => useEffectAmbience([rainEffect()], 1, false));
    await flushAsync();
    expect(enhancedAudioManager.play).not.toHaveBeenCalled();
  });

  it('stops the loop when the effect reaches its end time', async () => {
    renderHook(() => useEffectAmbience([rainEffect({ endTime: Date.now() + 3000 })], 1));
    await flushAsync();
    expect(enhancedAudioManager.play).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(enhancedAudioManager.stop).toHaveBeenCalledWith(RAIN_AMBIENCE_TRACK_ID, expect.any(Number));
  });

  it('keeps a scene-bound rain loop playing instead of stopping via overflowing timer', async () => {
    renderHook(() =>
      useEffectAmbience(
        [rainEffect({ sceneBound: true, endTime: Number.MAX_SAFE_INTEGER })],
        1,
      ),
    );
    await flushAsync();
    expect(enhancedAudioManager.play).toHaveBeenCalledWith(
      RAIN_AMBIENCE_TRACK_ID,
      expect.any(String),
      expect.objectContaining({ loop: true }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(enhancedAudioManager.stop).not.toHaveBeenCalledWith(RAIN_AMBIENCE_TRACK_ID, expect.any(Number));
  });

  it('plays thunder after lightning strikes for storm rain', async () => {
    renderHook(() =>
      useEffectAmbience([rainEffect({ rain: { variant: 'storm' }, endTime: Date.now() + 120000 })], 1),
    );
    await flushAsync();

    // Storm strikes at most every 8.2s + up to 1.2s thunder delay.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });

    const thunderCalls = (enhancedAudioManager.play as ReturnType<typeof vi.fn>).mock.calls
      .filter(([trackId]) => String(trackId).startsWith(THUNDER_TRACK_PREFIX));
    expect(thunderCalls.length).toBeGreaterThanOrEqual(1);
  });
});
