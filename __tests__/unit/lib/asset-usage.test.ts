import {
  buildAssetUsageReport,
  collectAssetReferences,
  toSpriteUsageAssetId,
  type AvailableAsset,
} from '@/lib/asset-usage';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

function makeStep(overrides: Partial<TimelineStep> & { id: string; blockType: TimelineStep['blockType'] }): TimelineStep {
  const defaults: Record<TimelineStep['blockType'], TimelineStep['data']> = {
    background: { assetId: null, transition: 'instant', duration: 0 },
    character: {
      action: 'show',
      characterId: 'hero',
      spriteId: 'idle',
      position: 'left',
      transition: 'instant',
      delay: 0,
      duration: null,
    },
    text: { content: 'Hello.', typewriterSpeed: 0.5, anchorTo: 'background' },
    dialogue: { entries: [], currentEntryIndex: 0 },
    choice: { options: [] },
    effect: { effectType: 'flash', target: 'screen', intensity: 20, duration: 1 },
    music: { mode: 'silence', assetId: null, volume: 1, loop: false, fadeIn: 0, fadeOut: 0, boundTo: 'scene' },
    sound: { mode: 'silence', assetId: null, volume: 1, loop: false, fadeIn: 0, fadeOut: 0, pitchVariation: 0 },
    interactive_object: {
      objectId: 'object-1',
      name: 'Object',
      assetId: null,
      position: { x: 10, y: 10, width: 20, height: 20 },
      actions: [],
      oneTimeOnly: false,
      pulseAnimation: false,
    },
    camera: { action: 'reset', duration: 0, easing: 'linear' },
    variable: { variableName: 'flag', operation: 'set', value: true },
    transition: { mode: 'end', targetSceneId: null, transitionType: 'fade', duration: 0.2 },
    label: { name: 'checkpoint' },
    goto: { targetLabel: 'checkpoint', condition: null, elseTargetLabel: null },
  };

  return {
    collapsed: false,
    enabled: true,
    data: defaults[overrides.blockType],
    ...overrides,
  } as TimelineStep;
}

function makeScene(overrides: Partial<SceneRecord> & { id: string }): SceneRecord {
  return {
    storyId: 'story-1',
    name: overrides.id,
    timeline: [],
    sceneState: {} as SceneRecord['sceneState'],
    flowX: 0,
    flowY: 0,
    description: '',
    tags: [],
    connections: [],
    isStart: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('asset usage', () => {
  it('collects every supported asset reference and flags disabled steps', () => {
    const scenes = [
      makeScene({
        id: 'scene-1',
        timeline: [
          makeStep({
            id: 'bg-step',
            blockType: 'background',
            data: { assetId: 'bg-1', transition: 'fade', duration: 500 },
          }),
          makeStep({
            id: 'sprite-step',
            blockType: 'character',
            data: {
              action: 'show',
              characterId: 'hero',
              spriteId: 'idle',
              position: 'left',
              transition: 'instant',
              delay: 0,
              duration: null,
            },
          }),
          makeStep({
            id: 'music-step',
            blockType: 'music',
            data: { mode: 'track', assetId: 'music-1', volume: 1, loop: true, fadeIn: 0, fadeOut: 0, boundTo: 'scene' },
          }),
          makeStep({
            id: 'sound-step',
            blockType: 'sound',
            enabled: false,
            data: { mode: 'track', assetId: 'sfx-1', volume: 1, loop: false, fadeIn: 0, fadeOut: 0, pitchVariation: 0 },
          }),
          makeStep({
            id: 'object-step',
            blockType: 'interactive_object',
            data: {
              objectId: 'object-1',
              name: 'Key',
              assetId: 'object-1',
              position: { x: 1, y: 2, width: 3, height: 4 },
              actions: [],
              oneTimeOnly: false,
              pulseAnimation: true,
            },
          }),
          makeStep({ id: 'choice-step', blockType: 'choice' }),
          makeStep({ id: 'transition-step', blockType: 'transition' }),
          makeStep({ id: 'effect-step', blockType: 'effect' }),
        ],
      }),
    ];

    expect(collectAssetReferences(scenes)).toEqual([
      { assetId: 'bg-1', kind: 'background', sceneId: 'scene-1', stepId: 'bg-step', enabled: true },
      { assetId: toSpriteUsageAssetId('hero', 'idle'), kind: 'sprite', sceneId: 'scene-1', stepId: 'sprite-step', enabled: true },
      { assetId: 'music-1', kind: 'music', sceneId: 'scene-1', stepId: 'music-step', enabled: true },
      { assetId: 'sfx-1', kind: 'sound', sceneId: 'scene-1', stepId: 'sound-step', enabled: false },
      { assetId: 'object-1', kind: 'object', sceneId: 'scene-1', stepId: 'object-step', enabled: true },
    ]);
  });

  it('detects used, unused, and broken assets', () => {
    const references = collectAssetReferences([
      makeScene({
        id: 'scene-1',
        timeline: [
          makeStep({ id: 'bg-step', blockType: 'background', data: { assetId: 'bg-1', transition: 'instant', duration: 0 } }),
          makeStep({
            id: 'sprite-step',
            blockType: 'character',
            data: {
              action: 'show',
              characterId: 'hero',
              spriteId: 'idle',
              position: 'left',
              transition: 'instant',
              delay: 0,
              duration: null,
            },
          }),
          makeStep({
            id: 'missing-step',
            blockType: 'sound',
            data: { mode: 'track', assetId: 'missing-sfx', volume: 1, loop: false, fadeIn: 0, fadeOut: 0, pitchVariation: 0 },
          }),
        ],
      }),
    ]);
    const availableAssets: AvailableAsset[] = [
      { id: 'bg-1', kind: 'background', name: 'Library' },
      { id: toSpriteUsageAssetId('hero', 'idle'), kind: 'sprite', name: 'Hero / Idle' },
      { id: 'unused-music', kind: 'music', name: 'Unused theme' },
    ];

    const report = buildAssetUsageReport(references, availableAssets);

    expect(report.assets.find((item) => item.asset.id === 'bg-1')?.references).toHaveLength(1);
    expect(report.unusedAssets).toEqual([{ id: 'unused-music', kind: 'music', name: 'Unused theme' }]);
    expect(report.brokenReferences).toEqual([
      { assetId: 'missing-sfx', kind: 'sound', sceneId: 'scene-1', stepId: 'missing-step', enabled: true },
    ]);
  });

  it('uses aliases and compatible visual/audio pools without duplicating assets', () => {
    const references = [
      { assetId: 'file:///object.png', kind: 'object', sceneId: 'scene-1', stepId: 'object-step', enabled: true },
      { assetId: 'audio-1', kind: 'sound', sceneId: 'scene-1', stepId: 'sound-step', enabled: true },
    ] as const;

    const report = buildAssetUsageReport([...references], [
      { id: 'image-1', kind: 'background', name: 'Object image', aliases: ['file:///object.png'] },
      { id: 'audio-1', kind: 'music', name: 'Reusable audio' },
    ]);

    expect(report.unusedAssets).toEqual([]);
    expect(report.brokenReferences).toEqual([]);
    expect(report.assets[0].references[0].kind).toBe('object');
    expect(report.assets[1].references[0].kind).toBe('sound');
  });

  it('returns an empty report for empty scenes and libraries', () => {
    expect(buildAssetUsageReport(collectAssetReferences([]), [])).toEqual({
      references: [],
      assets: [],
      unusedAssets: [],
      brokenReferences: [],
    });
  });
});
