import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { runStoryDoctor } from '@/lib/story-doctor';

function makeStep(overrides: Partial<TimelineStep> & { id: string; blockType: TimelineStep['blockType'] }): TimelineStep {
  const defaults: Record<TimelineStep['blockType'], TimelineStep['data']> = {
    background: { assetId: null, transition: 'instant', duration: 0 },
    character: {
      action: 'show',
      characterId: 'hero',
      spriteId: 'hero-idle',
      position: 'left',
      transition: 'instant',
      delay: 0,
      duration: null,
    },
    text: { content: 'Hello there.', typewriterSpeed: 0.5, anchorTo: 'background' },
    dialogue: {
      entries: [{ id: 'entry-1', characterId: 'hero', spriteId: 'hero-idle', text: 'Hello there.' }],
      currentEntryIndex: 0,
    },
    choice: { options: [{ id: 'option-1', text: 'Continue', targetSceneId: null }] },
    effect: { effectType: 'flash', target: 'screen', intensity: 20, duration: 1 },
    music: { mode: 'silence', assetId: null, volume: 1, loop: false, fadeIn: 0, fadeOut: 0, boundTo: 'scene' },
    sound: { mode: 'silence', assetId: null, volume: 1, loop: false, fadeIn: 0, fadeOut: 0, pitchVariation: 0 },
    interactive_object: {
      objectId: 'object-1',
      name: 'Object',
      assetId: null,
      position: { x: 0, y: 0, width: 10, height: 10 },
      actions: [],
      oneTimeOnly: false,
      pulseAnimation: false,
    },
    camera: { action: 'reset', duration: 0, easing: 'linear' },
    variable: { variableName: 'visited', operation: 'set', value: true },
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

function endStep(id = 'end'): TimelineStep {
  return makeStep({ id, blockType: 'transition' });
}

function makeScene(overrides: Partial<SceneRecord> & { id: string }): SceneRecord {
  return {
    storyId: 'story-1',
    name: overrides.id,
    timeline: [endStep()],
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

describe('runStoryDoctor', () => {
  it('returns no findings for a clean story', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({ id: 'text-1', blockType: 'text' }),
          endStep(),
        ],
      }),
    ];

    expect(runStoryDoctor({ scenes }).findings).toEqual([]);
  });

  it('aggregates existing graph validator issues', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({
            id: 'choice-1',
            blockType: 'choice',
            data: { options: [{ id: 'option-1', text: 'Missing', targetSceneId: 'deleted-scene' }] },
          }),
        ],
      }),
      makeScene({ id: 'orphan' }),
    ];

    const report = runStoryDoctor({ scenes });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          sceneId: 'start',
          stepId: 'choice-1',
          code: 'graph.danglingChoiceTarget',
          messageParams: { targetSceneId: 'deleted-scene' },
        }),
        expect.objectContaining({
          severity: 'warning',
          sceneId: 'orphan',
          code: 'graph.unreachableScene',
        }),
      ]),
    );
  });

  it('reports empty content issues', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        connections: [{ targetSceneId: 'end', outputPort: 'next' }],
        timeline: [
          makeStep({ id: 'choice-1', blockType: 'choice', data: { options: [] } }),
          makeStep({
            id: 'choice-2',
            blockType: 'choice',
            data: { options: [{ id: 'option-1', text: '   ', targetSceneId: 'end' }] },
          }),
          makeStep({ id: 'text-1', blockType: 'text', data: { content: ' ', typewriterSpeed: 0.5, anchorTo: 'background' } }),
          makeStep({
            id: 'dialogue-1',
            blockType: 'dialogue',
            data: { entries: [{ id: 'entry-1', characterId: 'hero', spriteId: 'hero-idle', text: '' }], currentEntryIndex: 0 },
          }),
        ],
      }),
      makeScene({ id: 'end' }),
      makeScene({ id: 'empty', timeline: [] }),
    ];

    const codes = runStoryDoctor({ scenes }).findings.map((finding) => finding.code);

    expect(codes).toEqual(expect.arrayContaining([
      'content.emptyChoice',
      'content.emptyChoiceOption',
      'content.emptyText',
      'content.emptyDialogue',
      'content.emptyScene',
    ]));
  });

  it('reports missing background, character, music, and sound assets', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({ id: 'background-1', blockType: 'background', data: { assetId: 'missing-bg', transition: 'instant', duration: 0 } }),
          makeStep({ id: 'character-1', blockType: 'character' }),
          makeStep({
            id: 'music-1',
            blockType: 'music',
            data: { mode: 'track', assetId: 'missing-music', volume: 1, loop: true, fadeIn: 0, fadeOut: 0, boundTo: 'scene' },
          }),
          makeStep({
            id: 'sound-1',
            blockType: 'sound',
            data: { mode: 'track', assetId: 'missing-sound', volume: 1, loop: false, fadeIn: 0, fadeOut: 0, pitchVariation: 0 },
          }),
          endStep(),
        ],
      }),
    ];

    const codes = runStoryDoctor({ scenes, mediaAssets: [], audioAssets: [], characters: [] }).findings.map((finding) => finding.code);

    expect(codes).toEqual(expect.arrayContaining([
      'asset.missingBackground',
      'asset.missingCharacterSprite',
      'asset.missingMusic',
      'asset.missingSound',
    ]));
  });

  it('does not report resolvable injected assets', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({ id: 'background-1', blockType: 'background', data: { assetId: 'bg-1', transition: 'instant', duration: 0 } }),
          makeStep({ id: 'character-1', blockType: 'character' }),
          makeStep({
            id: 'music-1',
            blockType: 'music',
            data: { mode: 'track', assetId: 'music-1', volume: 1, loop: true, fadeIn: 0, fadeOut: 0, boundTo: 'scene' },
          }),
          endStep(),
        ],
      }),
    ];

    const report = runStoryDoctor({
      scenes,
      mediaAssets: [{ id: 'bg-1', type: 'image', uri: 'file://bg.png', name: 'BG', addedAt: 0 }],
      audioAssets: [{ id: 'music-1', name: 'Theme', uri: 'file://theme.mp3', type: 'music', createdAt: 0 }],
      characters: [{
        id: 'hero',
        name: 'Hero',
        sprites: [{ id: 'hero-idle', name: 'Idle', uri: 'file://hero.png', createdAt: 0 }],
        createdAt: 0,
      }],
    });

    expect(report.findings.some((finding) => finding.code.startsWith('asset.'))).toBe(false);
  });

  it('reports variables read before any write and variables written but never read', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({
            id: 'text-1',
            blockType: 'text',
            conditions: [{ variableName: 'has_key', operator: '==', value: true }],
          }),
          makeStep({ id: 'variable-1', blockType: 'variable', data: { variableName: 'unused_flag', operation: 'set', value: true } }),
          endStep(),
        ],
      }),
    ];

    const report = runStoryDoctor({ scenes });

    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'variable.possiblyUndefined',
        messageParams: { variableName: 'has_key' },
      }),
      expect.objectContaining({
        code: 'variable.unread',
        messageParams: { variableName: 'unused_flag' },
      }),
    ]));
  });

  it('does not flag underscore-prefixed built-in variable reads', () => {
    const scenes = [
      makeScene({
        id: 'start',
        isStart: true,
        timeline: [
          makeStep({
            id: 'text-1',
            blockType: 'text',
            conditions: [{ variableName: '_last_choice', operator: '==', value: 'option-1' }],
          }),
          endStep(),
        ],
      }),
    ];

    const report = runStoryDoctor({ scenes });

    expect(report.findings.some((finding) => finding.code === 'variable.possiblyUndefined')).toBe(false);
  });

  it('warns on dead ends but accepts deliberate transition endings', () => {
    const deadEndReport = runStoryDoctor({
      scenes: [
        makeScene({
          id: 'start',
          isStart: true,
          timeline: [makeStep({ id: 'text-1', blockType: 'text' })],
        }),
      ],
    });
    const endingReport = runStoryDoctor({
      scenes: [
        makeScene({
          id: 'start',
          isStart: true,
          timeline: [makeStep({ id: 'text-1', blockType: 'text' }), endStep()],
        }),
      ],
    });

    expect(deadEndReport.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'flow.deadEnd', severity: 'warning' }),
    ]));
    expect(endingReport.findings.some((finding) => finding.code === 'flow.deadEnd')).toBe(false);
  });

  it('validates labels and goto targets within a scene', () => {
    const report = runStoryDoctor({
      scenes: [
        makeScene({
          id: 'start',
          isStart: true,
          timeline: [
            makeStep({ id: 'label-empty', blockType: 'label', data: { name: '' } }),
            makeStep({ id: 'label-1', blockType: 'label', data: { name: 'twice' } }),
            makeStep({ id: 'label-2', blockType: 'label', data: { name: 'twice' } }),
            makeStep({ id: 'goto-empty', blockType: 'goto', data: { targetLabel: '', condition: null, elseTargetLabel: null } }),
            makeStep({ id: 'goto-dangling', blockType: 'goto', data: { targetLabel: 'missing', condition: null, elseTargetLabel: null } }),
            endStep(),
          ],
        }),
      ],
    });

    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'branching.emptyLabel', stepId: 'label-empty', severity: 'error' }),
      expect.objectContaining({ code: 'branching.duplicateLabel', stepId: 'label-2', messageParams: { labelName: 'twice' } }),
      expect.objectContaining({ code: 'branching.emptyGotoTarget', stepId: 'goto-empty', severity: 'error' }),
      expect.objectContaining({ code: 'branching.danglingGotoTarget', stepId: 'goto-dangling', messageParams: { labelName: 'missing' } }),
    ]));
  });

  it('accepts a well-formed label/goto pair and reads its condition variable', () => {
    const report = runStoryDoctor({
      scenes: [
        makeScene({
          id: 'start',
          isStart: true,
          timeline: [
            makeStep({ id: 'var-1', blockType: 'variable', data: { variableName: 'score', operation: 'set', value: 1 } }),
            makeStep({
              id: 'goto-1',
              blockType: 'goto',
              data: { targetLabel: 'ending', condition: { variableName: 'score', operator: '>=', value: 3 }, elseTargetLabel: null },
            }),
            makeStep({ id: 'label-1', blockType: 'label', data: { name: 'ending' } }),
            endStep(),
          ],
        }),
      ],
    });

    expect(report.findings.some((finding) => finding.code.startsWith('branching.'))).toBe(false);
    // The goto condition counts as a read, so `score` is not "unread".
    expect(report.findings.some((finding) => finding.code === 'variable.unread')).toBe(false);
  });

  it('uses the same trimmed label identity as the executor', () => {
    const report = runStoryDoctor({
      scenes: [
        makeScene({
          id: 'start',
          isStart: true,
          timeline: [
            makeStep({ id: 'goto-1', blockType: 'goto', data: { targetLabel: ' checkpoint ', condition: null, elseTargetLabel: null } }),
            makeStep({ id: 'label-1', blockType: 'label', data: { name: 'checkpoint' } }),
            endStep(),
          ],
        }),
      ],
    });

    expect(report.findings.some((finding) => finding.code === 'branching.danglingGotoTarget')).toBe(false);
  });

  it('summary counts match findings', () => {
    const report = runStoryDoctor({
      scenes: [
        makeScene({
          id: 'start',
          isStart: true,
          timeline: [
            makeStep({ id: 'choice-1', blockType: 'choice', data: { options: [] } }),
            makeStep({ id: 'text-1', blockType: 'text', data: { content: '', typewriterSpeed: 0.5, anchorTo: 'background' } }),
            endStep(),
          ],
        }),
      ],
    });

    expect(report.summary).toEqual({
      errors: report.findings.filter((finding) => finding.severity === 'error').length,
      warnings: report.findings.filter((finding) => finding.severity === 'warning').length,
    });
  });
});
