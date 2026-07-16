import { renderHook, waitFor, act } from '@testing-library/react';

import { useReaderAudio } from '../../hooks/useReaderAudio';
import { enhancedAudioManager } from '../../lib/audio-manager-enhanced';
import { resolvePlayableAssetUri } from '../../lib/asset-resolver';
import { getPlaybackAudioLibraryPure } from '../../lib/audio-library';
import { deactivateReaderAudioSession } from '../../lib/reader-audio-session';
import type { UserSettings } from '../../lib/user-settings';
import type { AudioTrigger } from '../../lib/audio-types';
import type { SceneState } from '../../lib/engine/runtime-types';

const { __setIsFocused } = require('@react-navigation/native');

type StoryScene = {
  id: string;
  text: string;
  characters: unknown[];
  choices: unknown[];
  backgroundImageUri?: string | null;
  voiceAudioUri?: string | null;
  musicUri?: string | null;
  audioTriggers?: AudioTrigger[];
};

const STORY_ID = 'story-1';

const defaultSettings: UserSettings = {
  bgmVolume: 0.7,
  voiceVolume: 0.8,
  sfxVolume: 0.6,
  textSpeed: 0.5,
  textSize: 'medium',
  readerFontScale: 1,
  readerLineHeightScale: 1.2,
  autoPlay: false,
  parallaxEnabled: true,
  aiPermissions: {
    scene_edit: 'confirm', appearance: 'confirm', changeset: 'confirm', image_generate: 'confirm',
  },
};

const createScene = (overrides = {}): StoryScene => ({
  id: 'scene_1',
  text: 'Hello',
  characters: [],
  choices: [],
  backgroundImageUri: null,
  voiceAudioUri: null,
  musicUri: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  deactivateReaderAudioSession();
  __setIsFocused(true);
});

describe('useReaderAudio', () => {
  describe('volume sync', () => {
    it('should set initial volumes on mount', () => {
      renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings, { blockedByOverlay: false }),
      );
      expect(enhancedAudioManager.setVolume).toHaveBeenCalledWith('bgm', 0.7);
      expect(enhancedAudioManager.setVolume).toHaveBeenCalledWith('voice', 0.8);
    });

    it('should update volumes when settings change', () => {
      const { rerender } = renderHook(
        ({ storyId, scene, settings }) => useReaderAudio(storyId, scene, settings),
        { initialProps: { storyId: STORY_ID, scene: createScene(), settings: defaultSettings } },
      );
      vi.clearAllMocks();

      rerender({
        storyId: STORY_ID,
        scene: createScene(),
        settings: { ...defaultSettings, bgmVolume: 0.3, voiceVolume: 0.5 },
      });

      expect(enhancedAudioManager.setVolume).toHaveBeenCalledWith('bgm', 0.3);
      expect(enhancedAudioManager.setVolume).toHaveBeenCalledWith('voice', 0.5);
    });
  });

  describe('audio library', () => {
    it('should load story audio library on mount', async () => {
      const library = [{ id: 'a1', name: 'SFX', uri: 'sfx.mp3', type: 'sfx' as const, loop: false, volume: 1, tags: [], createdAt: 0 }];
      (getPlaybackAudioLibraryPure as any).mockResolvedValue(library);

      renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings, { blockedByOverlay: false }),
      );

      await waitFor(() => {
        expect(getPlaybackAudioLibraryPure).toHaveBeenCalledWith(STORY_ID, expect.anything(), expect.anything());
        expect(enhancedAudioManager.loadLibrary).toHaveBeenCalledWith(library);
      });
    });
  });

  describe('scene transitions', () => {
    it('should cancel triggers and stop voice on scene change', () => {
      renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings, { blockedByOverlay: false }),
      );

      expect(enhancedAudioManager.cancelAllTriggers).toHaveBeenCalled();
      expect(enhancedAudioManager.stop).toHaveBeenCalledWith('voice');
    });

    it('should crossfade BGM when scene has new music', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/music.mp3');

      renderHook(() =>
        useReaderAudio(STORY_ID, createScene({ musicUri: 'music.mp3' }), defaultSettings),
      );

      await waitFor(() => {
        expect(resolvePlayableAssetUri).toHaveBeenCalledWith('music.mp3');
        expect(enhancedAudioManager.crossFade).toHaveBeenCalledWith(
          'bgm',
          '/resolved/music.mp3',
          { volume: 0.7, fadeInMs: 800, fadeOutMs: 800, loop: true },
        );
      });
    });

    it('should play bundled BGM when resolvePlayableAssetUri returns playable string', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('file:///bundled/music.mp3');

      renderHook(() =>
        useReaderAudio(
          STORY_ID,
          createScene({ musicUri: 'assets/sounds-sample/music-peaceful.mp3' }),
          defaultSettings,
        ),
      );

      await waitFor(() => {
        expect(resolvePlayableAssetUri).toHaveBeenCalledWith(
          'assets/sounds-sample/music-peaceful.mp3',
        );
        expect(enhancedAudioManager.crossFade).toHaveBeenCalled();
      });
    });

    it('should play voice when scene has voice audio', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/voice.mp3');

      renderHook(() =>
        useReaderAudio(STORY_ID, createScene({ voiceAudioUri: 'voice.mp3' }), defaultSettings),
      );

      await waitFor(() => {
        expect(resolvePlayableAssetUri).toHaveBeenCalledWith('voice.mp3');
        expect(enhancedAudioManager.play).toHaveBeenCalledWith('voice', '/resolved/voice.mp3', {
          volume: 0.8,
        });
      });
    });

    it('should execute scene_start triggers when present', async () => {
      const triggers = [
        { id: 't1', audioId: 'a1', triggerType: 'scene_start' as const },
      ];

      renderHook(() =>
        useReaderAudio(STORY_ID, createScene({ audioTriggers: triggers }), defaultSettings),
      );

      await waitFor(() => {
        expect(enhancedAudioManager.executeTriggersByType).toHaveBeenCalledWith(
          triggers,
          'scene_start',
        );
      });
    });

    it('should not re-run scene audio when trigger contents are unchanged', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/music.mp3');

      const { rerender } = renderHook(
        ({ scene }) => useReaderAudio(STORY_ID, scene, defaultSettings),
        {
          initialProps: {
            scene: createScene({
              musicUri: 'music.mp3',
              audioTriggers: [{ id: 't1', audioId: 'a1', triggerType: 'scene_start' as const }],
            }),
          },
        },
      );

      await waitFor(() => {
        expect(enhancedAudioManager.crossFade).toHaveBeenCalledTimes(1);
        expect(enhancedAudioManager.executeTriggersByType).toHaveBeenCalledTimes(1);
      });

      rerender({
        scene: createScene({
          musicUri: 'music.mp3',
          audioTriggers: [{ id: 't1', audioId: 'a1', triggerType: 'scene_start' as const }],
        }),
      });

      await waitFor(() => {
        expect(enhancedAudioManager.crossFade).toHaveBeenCalledTimes(1);
        expect(enhancedAudioManager.executeTriggersByType).toHaveBeenCalledTimes(1);
      });
    });

    it('should not execute triggers when none present', () => {
      renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings, { blockedByOverlay: false }),
      );
      expect(enhancedAudioManager.executeTriggersByType).not.toHaveBeenCalled();
    });

    it('should not stop bgm when new scene has no music', () => {
      renderHook(() => useReaderAudio(STORY_ID, createScene({ musicUri: null }), defaultSettings));
      expect(enhancedAudioManager.crossFade).not.toHaveBeenCalled();
      expect(enhancedAudioManager.stop).not.toHaveBeenCalledWith('bgm');
    });

    it('should stop runtime BGM when music block mode is silence', async () => {
      renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings, {
          sceneState: {
            backgroundAssetId: null,
            backgroundTransition: 'fade',
            characters: [],
            activeEffects: [],
            musicTrackId: null,
            musicPlaying: false,
            musicMode: 'silence',
            musicVolume: 0.8,
            musicLoop: true,
            musicFadeIn: 0,
            musicFadeOut: 1.2,
            musicBoundTo: 'continuous',
            variables: {},
            dialogueHistory: [],
            currentChoices: null,
            isTransitioning: false,
            transitionTarget: null,
          },
        }),
      );

      await waitFor(() => {
        expect(enhancedAudioManager.stop).toHaveBeenCalledWith('bgm', 1200);
      });
    });

    it('should play runtime sound events once', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/sfx.mp3');
      const sceneState = {
        backgroundAssetId: null,
        backgroundTransition: 'fade',
        characters: [],
        activeEffects: [],
        soundEvents: [
          {
            id: 'sound-event-1',
            assetId: 'sfx-door',
            mode: 'track' as const,
            volume: 0.5,
            loop: false,
            fadeIn: 0,
            fadeOut: 0.8,
            pitchVariation: 0,
            timestamp: 100,
          },
        ],
        musicTrackId: null,
        musicPlaying: false,
        musicVolume: 1,
        variables: {},
        dialogueHistory: [],
        currentChoices: null,
        isTransitioning: false,
        transitionTarget: null,
      };

      const { rerender } = renderHook(
        ({ state }) => useReaderAudio(STORY_ID, createScene(), defaultSettings, { sceneState: state }),
        { initialProps: { state: sceneState } },
      );

      await waitFor(() => {
        expect(resolvePlayableAssetUri).toHaveBeenCalledWith('sfx-door');
        expect(enhancedAudioManager.play).toHaveBeenCalledWith('sfx:sound-event-1', '/resolved/sfx.mp3', {
          volume: 0.3,
          loop: false,
          fadeIn: 0,
        });
      });

      rerender({ state: sceneState });

      await waitFor(() => {
        expect(enhancedAudioManager.play).toHaveBeenCalledTimes(1);
      });
    });

    it('should use asset channel for looped runtime sound events', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/loop.mp3');
      const sceneState = {
        backgroundAssetId: null,
        backgroundTransition: 'fade',
        characters: [],
        activeEffects: [],
        soundEvents: [
          {
            id: 'sound-event-loop',
            assetId: 'sfx-loop',
            mode: 'track' as const,
            volume: 1,
            loop: true,
            fadeIn: 0,
            fadeOut: 0.8,
            pitchVariation: 0,
            timestamp: 100,
          },
        ],
        musicTrackId: null,
        musicPlaying: false,
        musicVolume: 1,
        variables: {},
        dialogueHistory: [],
        currentChoices: null,
        isTransitioning: false,
        transitionTarget: null,
      };

      renderHook(() => useReaderAudio(STORY_ID, createScene(), defaultSettings, { sceneState }));

      await waitFor(() => {
        expect(enhancedAudioManager.play).toHaveBeenCalledWith('sfx:sfx-loop', '/resolved/loop.mp3', {
          volume: 0.6,
          loop: true,
          fadeIn: 0,
        });
      });
    });

    it('should cap remembered runtime sound events so old event ids can be replayed', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/sfx.mp3');
      const manySoundEvents = Array.from({ length: 205 }, (_, index) => ({
        id: `sound-event-${index}`,
        assetId: `sfx-${index}`,
        mode: 'track' as const,
        volume: 1,
        loop: false,
        fadeIn: 0,
        fadeOut: 0.8,
        pitchVariation: 0,
        timestamp: index,
      }));
      const baseSceneState = {
        backgroundAssetId: null,
        backgroundTransition: 'fade',
        characters: [],
        activeEffects: [],
        soundEvents: manySoundEvents,
        musicTrackId: null,
        musicPlaying: false,
        musicVolume: 1,
        variables: {},
        dialogueHistory: [],
        currentChoices: null,
        isTransitioning: false,
        transitionTarget: null,
      };

      const { rerender } = renderHook(
        ({ state }) => useReaderAudio(STORY_ID, createScene(), defaultSettings, { sceneState: state }),
        { initialProps: { state: baseSceneState } },
      );

      await waitFor(() => {
        expect(enhancedAudioManager.play).toHaveBeenCalledTimes(205);
      });

      vi.clearAllMocks();
      rerender({
        state: {
          ...baseSceneState,
          soundEvents: [manySoundEvents[0]],
        },
      });

      await waitFor(() => {
        expect(enhancedAudioManager.play).toHaveBeenCalledWith('sfx:sound-event-0', '/resolved/sfx.mp3', {
          volume: 0.6,
          loop: false,
          fadeIn: 0,
        });
      });
    });

    it('should stop scene-bound bgm when the next scene has no explicit music block', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/scene-bound.mp3');

      const sceneBoundState: SceneState = {
        backgroundAssetId: null,
        backgroundTransition: 'fade',
        characters: [],
        activeEffects: [],
        musicTrackId: 'scene-bound.mp3',
        musicPlaying: true,
        musicMode: 'track',
        musicVolume: 0.8,
        musicLoop: true,
        musicFadeIn: 0.5,
        musicFadeOut: 0.6,
        musicBoundTo: 'scene',
        variables: {},
        dialogueHistory: [],
        currentChoices: null,
        isTransitioning: false,
        transitionTarget: null,
      };

      const { rerender } = renderHook(
        ({ scene, state }) =>
          useReaderAudio(STORY_ID, scene, defaultSettings, { sceneState: state }),
        { initialProps: { scene: createScene({ id: 'scene_1' }), state: sceneBoundState } },
      );

      await waitFor(() => {
        expect(enhancedAudioManager.crossFade).toHaveBeenCalledWith(
          'bgm',
          '/resolved/scene-bound.mp3',
          { volume: defaultSettings.bgmVolume * 0.8, fadeInMs: 500, fadeOutMs: 600, loop: true },
        );
      });
      vi.clearAllMocks();

      rerender({
        scene: createScene({ id: 'scene_2' }),
        state: {
          ...sceneBoundState,
          musicTrackId: null,
          musicPlaying: false,
          musicMode: null,
        },
      });

      await waitFor(() => {
        expect(enhancedAudioManager.stop).toHaveBeenCalledWith('bgm', 600);
      });
      expect(enhancedAudioManager.crossFade).not.toHaveBeenCalled();
    });

    it('should keep a continuous bgm track playing when the next scene has no explicit music block', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/continuous.mp3');

      const continuousState: SceneState = {
        backgroundAssetId: null,
        backgroundTransition: 'fade',
        characters: [],
        activeEffects: [],
        musicTrackId: 'continuous.mp3',
        musicPlaying: true,
        musicMode: 'track',
        musicVolume: 0.8,
        musicLoop: true,
        musicFadeIn: 0.5,
        musicFadeOut: 0.6,
        musicBoundTo: 'continuous',
        variables: {},
        dialogueHistory: [],
        currentChoices: null,
        isTransitioning: false,
        transitionTarget: null,
      };

      const { rerender } = renderHook(
        ({ scene, state }) =>
          useReaderAudio(STORY_ID, scene, defaultSettings, { sceneState: state }),
        { initialProps: { scene: createScene({ id: 'scene_1' }), state: continuousState } },
      );

      await waitFor(() => {
        expect(enhancedAudioManager.crossFade).toHaveBeenCalled();
      });
      vi.clearAllMocks();

      rerender({
        scene: createScene({ id: 'scene_2' }),
        state: {
          ...continuousState,
          musicTrackId: null,
          musicPlaying: false,
          musicMode: null,
        },
      });

      await waitFor(() => {
        expect(enhancedAudioManager.cancelAllTriggers).toHaveBeenCalled();
      });
      expect(enhancedAudioManager.stop).not.toHaveBeenCalledWith('bgm', expect.anything());
      expect(enhancedAudioManager.crossFade).not.toHaveBeenCalled();
    });

    it('should auto-fade bgm after the configured autoFadeAfter duration', async () => {
      vi.useFakeTimers();
      try {
        (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/auto-fade.mp3');

        const autoFadeState = {
          backgroundAssetId: null,
          backgroundTransition: 'fade',
          characters: [],
          activeEffects: [],
          musicTrackId: 'auto-fade.mp3',
          musicPlaying: true,
          musicMode: 'track' as const,
          musicVolume: 0.8,
          musicLoop: true,
          musicFadeIn: 0.5,
          musicFadeOut: 0.6,
          musicBoundTo: 'continuous' as const,
          musicAutoFadeAfter: 3,
          variables: {},
          dialogueHistory: [],
          currentChoices: null,
          isTransitioning: false,
          transitionTarget: null,
        };

        renderHook(() =>
          useReaderAudio(STORY_ID, createScene({ id: 'scene_1' }), defaultSettings, {
            sceneState: autoFadeState,
          }),
        );

        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(enhancedAudioManager.crossFade).toHaveBeenCalled();
        expect(enhancedAudioManager.stop).not.toHaveBeenCalledWith('bgm', expect.anything());

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });

        expect(enhancedAudioManager.stop).toHaveBeenCalledWith('bgm', 600);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should cancel the pending autoFadeAfter timer when the scene changes first', async () => {
      vi.useFakeTimers();
      try {
        (resolvePlayableAssetUri as any).mockResolvedValue('/resolved/auto-fade-2.mp3');

        const autoFadeState: SceneState = {
          backgroundAssetId: null,
          backgroundTransition: 'fade',
          characters: [],
          activeEffects: [],
          musicTrackId: 'auto-fade-2.mp3',
          musicPlaying: true,
          musicMode: 'track',
          musicVolume: 0.8,
          musicLoop: true,
          musicFadeIn: 0.5,
          musicFadeOut: 0.6,
          musicBoundTo: 'continuous',
          musicAutoFadeAfter: 3,
          variables: {},
          dialogueHistory: [],
          currentChoices: null,
          isTransitioning: false,
          transitionTarget: null,
        };

        const { rerender } = renderHook(
          ({ scene, state }) =>
            useReaderAudio(STORY_ID, scene, defaultSettings, { sceneState: state }),
          { initialProps: { scene: createScene({ id: 'scene_1' }), state: autoFadeState } },
        );

        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(enhancedAudioManager.crossFade).toHaveBeenCalled();
        vi.clearAllMocks();

        await act(async () => {
          rerender({
            scene: createScene({ id: 'scene_2' }),
            state: { ...autoFadeState, musicAutoFadeAfter: undefined },
          });
          await vi.advanceTimersByTimeAsync(0);
        });

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });

        expect(enhancedAudioManager.stop).not.toHaveBeenCalledWith('bgm', expect.anything());
      } finally {
        vi.useRealTimers();
      }
    });

    it('should adjust volume when same bgm track persists', async () => {
      (resolvePlayableAssetUri as any).mockResolvedValue('/same-track.mp3');

      const { rerender } = renderHook(
        ({ storyId, scene, settings }) => useReaderAudio(storyId, scene, settings),
        {
          initialProps: {
            storyId: STORY_ID,
            scene: createScene({ musicUri: 'track.mp3' }),
            settings: defaultSettings,
          },
        },
      );

      await waitFor(() => {
        expect(enhancedAudioManager.crossFade).toHaveBeenCalled();
      });
      vi.clearAllMocks();

      rerender({
        storyId: STORY_ID,
        scene: createScene({ musicUri: 'track.mp3' }),
        settings: { ...defaultSettings, bgmVolume: 0.5 },
      });

      await waitFor(() => {
        expect(enhancedAudioManager.setVolume).toHaveBeenCalledWith('bgm', 0.5);
      });
    });
  });

  describe('cleanup', () => {
    it('should stop playback and skip scene audio while blocked by overlay', () => {
      renderHook(() =>
        useReaderAudio(
          STORY_ID,
          createScene({ musicUri: 'music.mp3' }),
          defaultSettings,
          { blockedByOverlay: true },
        ),
      );

      expect(enhancedAudioManager.cancelAllTriggers).toHaveBeenCalled();
      expect(enhancedAudioManager.stopAll).toHaveBeenCalledWith(0);
      expect(resolvePlayableAssetUri).not.toHaveBeenCalledWith('music.mp3');
      expect(enhancedAudioManager.crossFade).not.toHaveBeenCalled();
    });

    it('should stop playback and skip scene audio when reader is not focused', () => {
      __setIsFocused(false);

      renderHook(() =>
        useReaderAudio(STORY_ID, createScene({ musicUri: 'music.mp3' }), defaultSettings),
      );

      expect(enhancedAudioManager.cancelAllTriggers).toHaveBeenCalled();
      expect(enhancedAudioManager.stopAll).toHaveBeenCalledWith(0);
      expect(resolvePlayableAssetUri).not.toHaveBeenCalledWith('music.mp3');
      expect(enhancedAudioManager.crossFade).not.toHaveBeenCalled();
    });

    it('should ignore resolved scene audio after the reader session is invalidated', async () => {
      let resolveMusic: (value: string) => void = () => {};
      (resolvePlayableAssetUri as any).mockReturnValue(
        new Promise<string>((resolve) => {
          resolveMusic = resolve;
        }),
      );

      renderHook(() =>
        useReaderAudio(STORY_ID, createScene({ musicUri: 'music.mp3' }), defaultSettings),
      );

      deactivateReaderAudioSession();
      resolveMusic('/resolved/music.mp3');

      await waitFor(() => {
        expect(resolvePlayableAssetUri).toHaveBeenCalledWith('music.mp3');
      });
      expect(enhancedAudioManager.crossFade).not.toHaveBeenCalled();
    });

    it('should stop all audio on unmount', () => {
      const { unmount } = renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings),
      );
      unmount();
      expect(enhancedAudioManager.cancelAllTriggers).toHaveBeenCalled();
      expect(enhancedAudioManager.stopAll).toHaveBeenCalledWith(0);
    });

    it('should initialize audio manager on mount', () => {
      renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings, { blockedByOverlay: false }),
      );
      expect(enhancedAudioManager.initialize).toHaveBeenCalled();
    });
  });

  describe('null scene handling', () => {
    it('should not execute triggers for null scene', () => {
      renderHook(() => useReaderAudio(STORY_ID, null, defaultSettings));
      expect(enhancedAudioManager.executeTriggersByType).not.toHaveBeenCalled();
    });
  });
});
