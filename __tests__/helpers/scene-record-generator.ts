import type { CharacterBlockData, Condition, SceneRecord, TimelineStep } from '@/lib/engine/types';

export type SeededRng = () => number;

export function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateSceneRecordOptions {
  storyId?: string;
  sceneId?: string;
  variant?: number;
  sceneCount?: number;
  emptyTimeline?: boolean;
  multilineText?: boolean;
  includeKnownLossyDocumentBlocks?: boolean;
}

export interface GenerateStoryScenesOptions {
  storyId?: string;
  sceneCount: number;
  includeEmptyTimeline?: boolean;
}

const positions: CharacterBlockData['position'][] = ['left', 'center', 'right', 'far-left', 'far-right'];
const conditionOperators: Condition['operator'][] = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'isEmpty', 'has', 'not_has'];

function cycle<T>(values: readonly T[], variant: number, offset = 0): T {
  return values[(variant + offset) % values.length];
}

function n(rng: SeededRng, min: number, max: number, precision = 2): number {
  const value = min + rng() * (max - min);
  return Number(value.toFixed(precision));
}

function condition(variant: number, offset = 0): Condition {
  const valueCycle = [
    `flag_${variant}_${offset}`,
    Math.round(variant + offset + 1),
    (variant + offset) % 2 === 0,
  ] as const;
  return {
    variableName: `var_${variant}_${offset}`,
    operator: cycle(conditionOperators, variant, offset),
    value: valueCycle[(variant + offset) % valueCycle.length],
  };
}

function step(
  id: string,
  blockType: TimelineStep['blockType'],
  data: TimelineStep['data'],
  variant: number,
  offset: number,
): TimelineStep {
  const result: TimelineStep = {
    id,
    blockType,
    data,
    collapsed: (variant + offset) % 4 === 0,
    enabled: (variant + offset) % 7 !== 0,
  };
  if ((variant + offset) % 3 === 0 || blockType === 'effect' || blockType === 'music' || blockType === 'sound') {
    result.conditions = [condition(variant, offset)];
  }
  return result;
}

function sceneState(): SceneRecord['sceneState'] {
  return {
    backgroundAssetId: null,
    backgroundTransition: 'fade',
    characters: [],
    activeEffects: [],
    musicTrackId: null,
    musicPlaying: false,
    musicVolume: 1,
    variables: {},
    dialogueHistory: [],
    currentChoices: null,
    isTransitioning: false,
    transitionTarget: null,
  };
}

function generatedTimeline(rng: SeededRng, sceneId: string, variant: number, multilineText: boolean): TimelineStep[] {
  const charId = `char_${variant % 5}`;
  const spriteId = `sprite_${variant % 4}`;
  const validTarget = `scene_${(variant + 1) % 4}`;
  const danglingTarget = `missing_scene_${variant}`;
  const text = multilineText
    ? `Line one seed ${variant}\nUnicode line Привіт ${variant}\nEmoji-safe text ${variant}`
    : `Narration seed ${variant} with unicode Привіт and quote "line".`;

  return [
    step(`step_${sceneId}_background`, 'background', {
      assetId: variant % 2 === 0 ? `bg_${variant}` : null,
      transition: cycle(['fade', 'dissolve', 'instant', 'wipe'] as const, variant),
      duration: Math.round(n(rng, 200, 2000, 0)),
      ...((variant % 2 === 0) ? { delay: n(rng, 0, 2) } : {}),
    }, variant, 1),
    step(`step_${sceneId}_character_visible`, 'character', {
      action: 'show',
      characterId: charId,
      spriteId,
      position: 'center',
      transition: 'fade',
      delay: 0,
      duration: null,
      effect: null,
    }, variant, 2),
    step(`step_${sceneId}_text`, 'text', {
      content: text,
      typewriterSpeed: n(rng, 0.1, 0.95),
      anchorTo: variant % 2 === 0 ? 'character' : 'background',
      ...((variant % 2 === 0) ? { characterId: charId, spriteId } : {}),
    }, variant, 3),
    step(`step_${sceneId}_dialogue`, 'dialogue', {
      entries: [
        {
          id: `entry_${sceneId}_a`,
          characterId: charId,
          speakerName: charId,
          spriteId,
          text: `Dialogue ${variant}.\nSecond sentence stays in one entry.`,
        },
        {
          id: `entry_${sceneId}_b`,
          characterId: `char_${(variant + 1) % 5}`,
          spriteId: `sprite_${(variant + 1) % 4}`,
          text: `Reply ${variant}`,
          ...((variant % 2 === 0) ? { speakerName: `Speaker ${variant}` } : {}),
        },
      ],
      currentEntryIndex: variant % 2,
      speakerFocus: { characterId: charId, enabled: true, scale: 1.04, dimOthers: true },
    }, variant, 4),
    step(`step_${sceneId}_choice`, 'choice', {
      options: [
        {
          id: `choice_${sceneId}_valid`,
          text: `Go to valid ${variant}`,
          targetSceneId: validTarget,
          condition: condition(variant, 10),
        },
        {
          id: `choice_${sceneId}_fallthrough`,
          text: `Stay ${variant}`,
          targetSceneId: null,
        },
        {
          id: `choice_${sceneId}_dangling`,
          text: `Dangling ${variant}`,
          targetSceneId: danglingTarget,
        },
      ],
    }, variant, 5),
    step(`step_${sceneId}_effect`, 'effect', {
      effectType: cycle(['shake', 'flash', 'blur', 'rain', 'snow', 'fog', 'glitch', 'vignette'] as const, variant),
      target: cycle(['screen', 'character', 'background'] as const, variant),
      characterId: charId,
      intensity: Math.round(n(rng, 10, 100, 0)),
      duration: n(rng, 0.2, 8),
      durationMode: cycle(['scene', 'timed'] as const, variant),
      ...((variant % 2 === 0) ? { fadeIn: n(rng, 0, 1), fadeOut: n(rng, 0, 1) } : {}),
      rain: { variant: cycle(['rain', 'storm', 'drizzle', 'fallout'] as const, variant), density: Math.round(n(rng, 40, 160, 0)), lightning: variant % 2 === 0 },
      snow: { snowflakeCount: Math.round(n(rng, 24, 120, 0)), radius: [0.5, 3], imageUris: [`file://flake-${variant}.png`] },
      fog: { variant: cycle(['light', 'dense'] as const, variant) },
    }, variant, 6),
    step(`step_${sceneId}_music`, 'music', {
      mode: cycle(['track', 'silence'] as const, variant),
      assetId: variant % 2 === 0 ? `music_${variant}` : null,
      volume: n(rng, 0.1, 1),
      loop: variant % 2 === 0,
      fadeIn: n(rng, 0, 4),
      fadeOut: n(rng, 0, 4),
      boundTo: cycle(['scene', 'continuous'] as const, variant),
      ...((variant % 2 === 0) ? { autoFadeAfter: n(rng, 1, 12) } : {}),
    }, variant, 7),
    step(`step_${sceneId}_sound`, 'sound', {
      mode: cycle(['track', 'silence'] as const, variant + 1),
      assetId: variant % 2 === 0 ? null : `sfx_${variant}`,
      volume: n(rng, 0.1, 1),
      loop: variant % 3 === 0,
      fadeIn: n(rng, 0, 1),
      fadeOut: n(rng, 0, 2),
      pitchVariation: n(rng, 0, 1),
      ...((variant % 2 === 0) ? { boundTo: cycle(['scene', 'continuous'] as const, variant) } : {}),
    }, variant, 8),
    step(`step_${sceneId}_interactive`, 'interactive_object', {
      objectId: `object_${variant}`,
      name: `Object ${variant}`,
      assetId: variant % 2 === 0 ? `asset_object_${variant}` : null,
      position: { x: n(rng, 0, 80), y: n(rng, 0, 80), width: n(rng, 5, 20), height: n(rng, 5, 20) },
      actions: [
        { type: 'dialogue', text: `Inspect ${variant}`, speaker: 'Narrator' },
        { type: 'scene_transition', targetSceneId: validTarget, transition: cycle(['fade', 'slide', 'instant'] as const, variant) },
        { type: 'play_audio', audioUri: `file://sfx-${variant}.wav`, volume: n(rng, 0.1, 1), loop: false },
        { type: 'show_image', imageUri: `file://image-${variant}.png`, duration: 500 + variant },
        { type: 'trigger_event', eventId: `event_${variant}`, data: { seed: variant } },
      ],
      oneTimeOnly: variant % 2 === 0,
      pulseAnimation: variant % 3 === 0,
    }, variant, 9),
    step(`step_${sceneId}_camera`, 'camera', {
      action: cycle(['zoom', 'pan', 'focus', 'reset'] as const, variant),
      target: charId,
      zoomLevel: n(rng, 0.5, 3),
      panX: n(rng, -50, 50),
      panY: n(rng, -50, 50),
      duration: n(rng, 0, 4),
      easing: cycle(['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const, variant),
    }, variant, 10),
    step(`step_${sceneId}_variable`, 'variable', {
      variableName: `var_${variant}`,
      operation: cycle(['set', 'add', 'subtract', 'multiply', 'toggle'] as const, variant),
      value: cycle([`value_${variant}`, variant, variant % 2 === 0] as const, variant),
    }, variant, 11),
    step(`step_${sceneId}_transition`, 'transition', {
      mode: cycle(['next', 'scene', 'end'] as const, variant),
      targetSceneId: cycle(['next', 'scene', 'end'] as const, variant) === 'scene' ? danglingTarget : null,
      transitionType: cycle(['fade', 'slide', 'instant'] as const, variant),
      duration: n(rng, 0, 3),
    }, variant, 12),
    step(`step_${sceneId}_character_variant`, 'character', {
      action: cycle(['show', 'hide', 'change_sprite', 'move'] as const, variant),
      generatedByInlineDialogue: variant % 2 === 0 ? false : undefined,
      characterId: `char_${(variant + 2) % 5}`,
      spriteId: `sprite_${(variant + 2) % 4}`,
      position: cycle(positions, variant),
      transition: cycle(['instant', 'fade', 'slide-left', 'slide-right', 'zoom'] as const, variant),
      delay: n(rng, 0, 2),
      duration: variant % 2 === 0 ? n(rng, 0.5, 5) : null,
      effect: variant % 2 === 0
        ? { type: cycle(['move', 'shake', 'hide', 'show', 'scale'] as const, variant), duration: n(rng, 0.2, 2), intensity: Math.round(n(rng, 1, 100, 0)), direction: cycle(['left', 'right', 'up', 'down'] as const, variant), targetScale: n(rng, 0.5, 2) }
        : null,
    }, variant, 13),
  ];
}

export function generateSceneRecord(rng: SeededRng, options: GenerateSceneRecordOptions = {}): SceneRecord {
  const variant = options.variant ?? Math.floor(rng() * 10_000);
  const storyId = options.storyId ?? 'story_fuzz';
  const sceneId = options.sceneId ?? `scene_${variant}`;
  const includeKnownLossyDocumentBlocks = options.includeKnownLossyDocumentBlocks ?? true;
  const timeline = options.emptyTimeline
    ? []
    : generatedTimeline(rng, sceneId, variant, options.multilineText ?? variant % 10 === 0)
      .filter((item) => includeKnownLossyDocumentBlocks || (item.blockType !== 'character' && item.blockType !== 'dialogue'));

  return {
    id: sceneId,
    storyId,
    name: `Scene ${variant}`,
    description: `Description ${variant}`,
    tags: variant % 2 === 0 ? ['fuzz', `seed-${variant}`] : [],
    timeline,
    sceneState: sceneState(),
    flowX: variant * 10,
    flowY: variant * -5,
    connections: [
      { targetSceneId: `scene_${(variant + 1) % (options.sceneCount ?? 4)}`, outputPort: 'next', label: 'Next' },
      { targetSceneId: `missing_scene_${variant}`, outputPort: `choice_${sceneId}_dangling`, label: `Dangling ${variant}` },
    ],
    isStart: variant === 1,
    createdAt: 1_700_000_000_000 + variant,
    updatedAt: 1_700_000_100_000 + variant,
  };
}

export function generateStoryScenes(rng: SeededRng, options: GenerateStoryScenesOptions): SceneRecord[] {
  const storyId = options.storyId ?? 'story_fuzz';
  return Array.from({ length: options.sceneCount }, (_, index) => {
    const variant = index + 1;
    return {
      ...generateSceneRecord(rng, {
        storyId,
        sceneId: `scene_${index}`,
        variant,
        sceneCount: options.sceneCount,
        emptyTimeline: Boolean(options.includeEmptyTimeline && index === options.sceneCount - 1),
        multilineText: index === 1,
      }),
      isStart: index === 0,
      connections: [
        ...(index + 1 < options.sceneCount
          ? [{ targetSceneId: `scene_${index + 1}`, outputPort: 'next', label: 'Next' }]
          : []),
        { targetSceneId: `missing_scene_${index}`, outputPort: `choice_scene_${index}_dangling`, label: `Dangling ${index}` },
      ],
    };
  });
}
