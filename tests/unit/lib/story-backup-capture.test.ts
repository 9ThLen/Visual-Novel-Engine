import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { captureStoryBackup } from '@/lib/story-backup/capture';
import { useAppStore } from '@/stores/use-app-store';

const STORY_ID = 'story-backup-capture';
const BG_URI = 'data:image/png;base64,AQID';
const VOICE_URI = 'data:audio/wav;base64,BAUG';
const SPRITE_URI = 'data:image/webp;base64,BwgJ';
const UNUSED_URI = 'data:image/gif;base64,CgsM';
const ACTION_URI = 'data:image/jpeg;base64,DQ4P';
const STATE_ONLY_URI = 'data:image/avif;base64,EBES';
const MISSING_BUNDLED_VOICE_URI = 'assets/sounds-sample/voice-guide-hall.mp3';

function scene(): SceneRecord {
  const timeline: TimelineStep[] = [
    {
      id: 'background-step',
      blockType: 'background',
      collapsed: false,
      enabled: true,
      data: { assetId: 'background-asset', transition: 'fade', duration: 500 },
    },
    {
      id: 'interactive-step',
      blockType: 'interactive_object',
      collapsed: false,
      enabled: true,
      data: {
        objectId: 'object-1',
        name: 'Object',
        assetId: 'background-asset',
        position: { x: 0, y: 0, width: 10, height: 10 },
        actions: [{ type: 'show_image', imageUri: ACTION_URI, duration: 1000 }],
        oneTimeOnly: false,
        pulseAnimation: false,
      },
    },
  ];
  return {
    id: 'scene-1',
    storyId: STORY_ID,
    name: 'Scene',
    description: '',
    tags: [],
    timeline,
    sceneState: {
      backgroundAssetId: 'background-asset',
      backgroundTransition: 'fade',
      characters: [],
      activeEffects: [],
      soundEvents: [{
        id: 'state-sound',
        assetId: 'voice-asset',
        mode: 'track',
        volume: 1,
        loop: false,
        fadeIn: 0,
        fadeOut: 0,
        pitchVariation: 0,
        timestamp: 1,
      }],
      interactiveObjects: [{
        id: 'state-object',
        imageUri: STATE_ONLY_URI,
        actions: [{ type: 'play_audio', audioUri: VOICE_URI }],
      }],
      musicTrackId: 'voice-asset',
      musicPlaying: false,
      musicVolume: 1,
      variables: {},
      dialogueHistory: [],
      currentChoices: null,
      isTransitioning: false,
      transitionTarget: null,
    },
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    voiceAudioUri: MISSING_BUNDLED_VOICE_URI,
    audioTriggers: [{ id: 'trigger-1', audioId: 'voice-item', triggerType: 'scene_start' }],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('captureStoryBackup', () => {
  it('captures explicit membership, voice, sprites and interactive action URIs', async () => {
    const before = useAppStore.getState();
    useAppStore.setState({
      storiesMetadata: [{
        id: STORY_ID,
        title: 'Capture story',
        startSceneId: 'scene-1',
        thumbnailUri: BG_URI,
        createdAt: 1,
        updatedAt: 1,
        sceneCount: 1,
      }],
      sceneRecordsByStory: { [STORY_ID]: { 'scene-1': scene() } },
      sceneRecordHydration: { [STORY_ID]: 'full' },
      characterLibraries: {
        [STORY_ID]: [{
          id: 'character-1',
          name: 'Character',
          sprites: [{ id: 'sprite-1', name: 'Default', uri: SPRITE_URI, createdAt: 1 }],
          createdAt: 1,
        }],
      },
      audioLibraries: {
        [STORY_ID]: [{
          id: 'voice-item',
          name: 'Voice',
          uri: VOICE_URI,
          type: 'voice',
          createdAt: 1,
        }],
      },
      mediaLibrary: [
        { id: 'background-asset', type: 'image', uri: BG_URI, name: 'bg.png', addedAt: 1 },
        { id: 'voice-asset', type: 'audio', uri: VOICE_URI, name: 'voice.wav', addedAt: 1 },
        { id: 'sprite-asset', type: 'image', uri: SPRITE_URI, name: 'sprite.webp', addedAt: 1 },
        { id: 'unused-asset', type: 'image', uri: UNUSED_URI, name: 'unused.gif', addedAt: 1 },
        { id: 'unused-alias', type: 'other', uri: UNUSED_URI, name: 'unused-copy.bin', addedAt: 1 },
      ],
      imageAssetIdsByStory: { [STORY_ID]: ['background-asset'] },
      mediaAssetIdsByStory: {
        [STORY_ID]: [
          'background-asset',
          'unused-asset',
          'unused-alias',
          'stale-asset',
          'file:///stale-membership.mp3',
        ],
      },
    });

    try {
      const captured = await captureStoryBackup(STORY_ID);
      expect(captured.payload.scenes).toHaveProperty('scene-1');
      expect(captured.assets).toHaveLength(7);
      expect(captured.assets.find((asset) => asset.metadata.assetId === 'unused-asset')).toBeTruthy();
      expect(captured.assets.find((asset) => asset.metadata.assetId === 'unused-alias')?.metadata.sourceReferences)
        .toEqual(['unused-alias']);
      expect(captured.assets.find((asset) => asset.metadata.sourceReferences.includes(VOICE_URI))).toBeTruthy();
      expect(captured.assets.find((asset) => asset.metadata.sourceReferences.includes(SPRITE_URI))).toBeTruthy();
      expect(captured.assets.find((asset) => asset.metadata.sourceReferences.includes(ACTION_URI))).toBeTruthy();
      expect(captured.assets.find((asset) => asset.metadata.sourceReferences.includes(STATE_ONLY_URI))).toBeTruthy();
      expect(captured.assets.some((asset) =>
        asset.metadata.sourceReferences.includes(MISSING_BUNDLED_VOICE_URI)
      )).toBe(false);
      expect(captured.payload.scenes['scene-1'].voiceAudioUri).toBe(MISSING_BUNDLED_VOICE_URI);
      expect(captured.payload.mediaMembershipIds).toHaveLength(7);
    } finally {
      useAppStore.setState(before, true);
    }
  });
});
