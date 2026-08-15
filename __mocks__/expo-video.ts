import React from 'react';

export type VideoSource = string | number | { uri?: string; assetId?: number } | null;

interface MockVideoPlayer {
  status: string;
  playing: boolean;
  loop: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  currentTime: number;
  timeUpdateEventInterval: number;
  keepScreenOnWhilePlaying: boolean;
  play(): void;
  pause(): void;
}

export function useVideoPlayer(
  source: VideoSource,
  setup?: (player: MockVideoPlayer) => void,
): MockVideoPlayer {
  const setupRef = React.useRef(setup);
  setupRef.current = setup;
  return React.useMemo(() => {
    const player: MockVideoPlayer = {
      status: source ? 'readyToPlay' : 'idle',
      playing: false,
      loop: false,
      muted: false,
      volume: 1,
      playbackRate: 1,
      currentTime: 0,
      timeUpdateEventInterval: 0,
      keepScreenOnWhilePlaying: true,
      play() { player.playing = true; },
      pause() { player.playing = false; },
    };
    setupRef.current?.(player);
    return player;
  }, [source]);
}

export function VideoView(props: Record<string, unknown>) {
  return React.createElement('VideoView', props);
}
