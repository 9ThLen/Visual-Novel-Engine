/**
 * Mock for expo-audio.
 *
 * `createAudioPlayer` returns a fake player whose listeners the test drives:
 * `emitStatus` is how a test says "the track finished" or moves the position,
 * and `mockAudioPlayers` records every instance so a test can assert that the
 * library really keeps one player rather than one per tile.
 */

type StatusListener = (status: Record<string, unknown>) => void;

export interface MockAudioPlayer {
  source: unknown;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  /** Feed a playbackStatusUpdate to whatever subscribed. */
  emitStatus: (status: Partial<{ currentTime: number; duration: number; didJustFinish: boolean }>) => void;
}

export const mockAudioPlayers: MockAudioPlayer[] = [];

export const mockSetAudioModeAsync = vi.fn().mockResolvedValue(undefined);

export const mockCreateAudioPlayer = vi.fn((source: unknown) => {
  const listeners: StatusListener[] = [];
  const player: MockAudioPlayer = {
    source,
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn(),
    addListener: vi.fn((event: string, listener: StatusListener) => {
      if (event === 'playbackStatusUpdate') listeners.push(listener);
      return { remove: vi.fn() };
    }),
    emitStatus: (status) => {
      listeners.forEach((listener) => listener({
        currentTime: 0,
        duration: 0,
        didJustFinish: false,
        ...status,
      }));
    },
  };
  mockAudioPlayers.push(player);
  return player;
});

export function resetMockAudioPlayers(): void {
  mockAudioPlayers.length = 0;
  mockCreateAudioPlayer.mockClear();
}

export const setAudioModeAsync = mockSetAudioModeAsync;
export const createAudioPlayer = mockCreateAudioPlayer;
