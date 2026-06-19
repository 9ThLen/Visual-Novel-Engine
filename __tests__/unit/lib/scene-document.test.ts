import { getCharacterColor } from '@/lib/scene-document/characterColor';
import { parseSceneText } from '@/lib/scene-document/sceneParser';
import { serializeScene } from '@/lib/scene-document/sceneSerializer';
import { validateSceneNodes } from '@/lib/scene-document/sceneValidation';
import type { SceneDocument } from '@/lib/scene-document/sceneTypes';

describe('scene document parser', () => {
  it('parses dialogue', () => {
    expect(parseSceneText('Маша: Привіт!')).toEqual([
      expect.objectContaining({
        type: 'dialogue',
        characterName: 'Маша',
        text: 'Привіт!',
      }),
    ]);
  });

  it('parses narration', () => {
    expect(parseSceneText('Це звичайний текст автора.')).toEqual([
      expect.objectContaining({
        type: 'narration',
        text: 'Це звичайний текст автора.',
      }),
    ]);
  });

  it('parses background and audio commands', () => {
    expect(parseSceneText('[background forest_day]\n[play music calm_theme loop volume=0.8]\n[play sfx door_knock]')).toEqual([
      expect.objectContaining({ type: 'background', assetId: 'forest_day' }),
      expect.objectContaining({ type: 'music', action: 'play', assetId: 'calm_theme', loop: true, volume: 0.8 }),
      expect.objectContaining({ type: 'sound', action: 'play', assetId: 'door_knock' }),
    ]);
  });

  it('keeps unknown bracket commands as command nodes', () => {
    expect(parseSceneText('[shake screen]')).toEqual([
      expect.objectContaining({ type: 'command', raw: '[shake screen]' }),
    ]);
  });
});

describe('scene document serializer', () => {
  it('serializes dialogue and background', () => {
    const scene: SceneDocument = {
      id: 'scene_1',
      title: 'Scene',
      nodes: [
        { id: 'dialogue_1', type: 'dialogue', characterName: 'Маша', text: 'Привіт!' },
        { id: 'background_1', type: 'background', assetId: 'forest_day' },
      ],
    };

    expect(serializeScene(scene)).toBe('Маша: Привіт!\n[background forest_day]');
  });
});

describe('scene document character colors', () => {
  it('returns a stable color for the same character name', () => {
    expect(getCharacterColor('Маша')).toBe(getCharacterColor('  маша  '));
  });
});

describe('scene document validation', () => {
  it('reports missing background assetId', () => {
    expect(validateSceneNodes(parseSceneText('[background]'))).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'Background assetId is required.',
      }),
    ]);
  });

  it('reports unknown commands as warnings', () => {
    expect(validateSceneNodes(parseSceneText('[shake screen]'))).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: 'Unknown command will be saved as text.',
      }),
    ]);
  });
});
