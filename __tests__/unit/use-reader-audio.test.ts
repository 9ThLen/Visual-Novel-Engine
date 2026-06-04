import { renderHook, waitFor } from '@testing-library/react';

import { useReaderAudio } from '../../hooks/useReaderAudio';
import { enhancedAudioManager } from '../../lib/audio-manager-enhanced';
import { resolvePlayableAssetUri } from '../../lib/asset-resolver';
import { getPlaybackAudioLibrary } from '../../lib/audio-library';
import { deactivateReaderAudioSession } from '../../lib/reader-audio-session';
import type { UserSettings } from '../../lib/user-settings';
import type { StoryScene } from '../../lib/types';

const STORY_ID = 'story-1';

const defaultSettings: UserSettings = {
  bgmVolume: 0.7,
  voiceVolume: 0.8,
  sfxVolume: 0.6,
  textSpeed: 0.5,
  textSize: 'medium',
  autoPlay: false,
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
      (getPlaybackAudioLibrary as any).mockResolvedValue(library);

      renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings, { blockedByOverlay: false }),
      );

      await waitFor(() => {
        expect(getPlaybackAudioLibrary).toHaveBeenCalledWith(STORY_ID);
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
          { volume: 0.7, duration: 800 },
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

    it('should stop runtime BGM when music block action is stop', async () => {
      renderHook(() =>
        useReaderAudio(STORY_ID, createScene(), defaultSettings, {
          sceneState: {
            backgroundAssetId: null,
            backgroundTransition: 'fade',
            characters: [],
            activeEffects: [],
            musicTrackId: null,
            musicPlaying: false,
            musicAction: 'stop',
            musicVolume: 0.8,
            musicLoop: true,
            musicFadeDuration: 1200,
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
            action: 'play' as const,
            volume: 0.5,
            loop: false,
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
            action: 'play' as const,
            volume: 1,
            loop: true,
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
        });
      });
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
