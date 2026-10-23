import { comicCues, comicElements, comicStepElements, type ComicBubble } from '@/lib/comic/comic-script';
import type { DocumentBlock, DocumentInlinePart, DocumentScene } from '@/lib/document-editor/types';
import { saveDocumentSceneToRecord } from '@/lib/document-scene-persistence';
import {
  createCharacterStep,
  createChoiceStep,
  createDialogueEntry,
  createDialogueStep,
  createEffectStep,
  createSoundStep,
  createTextStep,
} from '@/lib/engine/event-factory';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';

const withId = (step: TimelineStep, id: string, origin: Partial<TimelineStep> = {}): TimelineStep => ({ ...step, id, ...origin });
const text = (id: string, content: string, origin?: Partial<TimelineStep>) => withId(createTextStep({ content }), id, origin);

function emptyScene(): SceneRecord {
  return {
    id: 'scene-1',
    storyId: 'story-1',
    name: 'Scene',
    description: '',
    tags: [],
    timeline: [],
    sceneState: {
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
    },
    flowX: 0,
    flowY: 0,
    connections: [],
    isStart: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

/** The editor's save: the document as the frame sends it, normalized and written over the scene. */
function saved(blocks: DocumentBlock[]): TimelineStep[] {
  const scene = emptyScene();
  const document: DocumentScene = { sceneId: scene.id, sceneName: scene.name, blocks };
  const normalized = normalizePlateDocumentScene(document, []);
  return saveDocumentSceneToRecord(scene, normalized.scene, normalized.characters).timeline;
}

const thunder: DocumentInlinePart = {
  type: 'sound', id: 'sfx_thunder', mode: 'track', assetId: 'thunder.ogg', volume: 0.8, loop: false,
  fadeIn: 0, fadeOut: 0.8, pitchVariation: 0, boundTo: 'continuous',
};
const shake: DocumentInlinePart = { type: 'effect', id: 'fx_shake', effectType: 'shake', target: 'screen', intensity: 70, duration: 0.8 };

describe('the words of a scene as the comic sets them', () => {
  it('makes every sentence of narration a caption of its own, addressed as its sentence is', () => {
    const step = text('step-hall', 'The hall was dark. Rain hit the windows!\nSomeone waited…');

    expect(comicStepElements(step)).toEqual([
      { kind: 'caption', anchor: 'step-hall/p0/s0', stepId: 'step-hall', text: 'The hall was dark.', sentences: [{ anchor: 'step-hall/p0/s0', text: 'The hall was dark.' }], cues: [] },
      { kind: 'caption', anchor: 'step-hall/p0/s1', stepId: 'step-hall', text: 'Rain hit the windows!', sentences: [{ anchor: 'step-hall/p0/s1', text: 'Rain hit the windows!' }], cues: [] },
      { kind: 'caption', anchor: 'step-hall/p0/s2', stepId: 'step-hall', text: 'Someone waited…', sentences: [{ anchor: 'step-hall/p0/s2', text: 'Someone waited…' }], cues: [] },
    ]);
  });

  it('addresses a step by the block it was saved from', () => {
    const step = text('step-new-id', 'One. Two.', { originBlockId: 'doc_a' });
    expect(comicStepElements(step).map((element) => element.anchor)).toEqual(['doc_a/p0/s0', 'doc_a/p0/s1']);
  });

  it('never takes words in quotes inside narration for speech', () => {
    const elements = comicStepElements(text('step-1', '«Wait,» she said. "Nobody," said the dark. «Why?»'));
    expect(elements.map((element) => element.kind)).toEqual(['caption', 'caption', 'caption']);
    expect(elements.map((element) => element.text)).toEqual(['«Wait,» she said.', '"Nobody," said the dark.', '«Why?»']);
  });

  it('sets plain words, without the markup of the line', () => {
    expect(comicStepElements(text('step-1', 'It was **very** late.'))[0].text).toBe('It was very late.');
  });

  it('makes a line of dialogue a bubble with its speaker and sprite', () => {
    const step = withId(createDialogueStep({
      entries: [createDialogueEntry({ id: 'entry-1', characterId: 'alice', speakerName: 'Alice', spriteId: 'alice-smile', text: 'You came back. I knew it.' })],
    }), 'step-alice');

    expect(comicStepElements(step)).toEqual<ComicBubble[]>([{
      kind: 'bubble',
      style: 'normal',
      anchor: 'step-alice/p0/s0',
      stepId: 'step-alice',
      text: 'You came back. I knew it.',
      sentences: [
        { anchor: 'step-alice/p0/s0', text: 'You came back.' },
        { anchor: 'step-alice/p0/s1', text: 'I knew it.' },
      ],
      cues: [],
      entryId: 'entry-1',
      characterId: 'alice',
      speakerName: 'Alice',
      spriteId: 'alice-smile',
    }]);
  });

  it('makes every line of a dialogue step a bubble, its sentences numbered on from line to line', () => {
    const step = withId(createDialogueStep({
      entries: [
        createDialogueEntry({ id: 'e1', characterId: 'alice', spriteId: 'a', text: 'Hello. How are you?' }),
        createDialogueEntry({ id: 'e2', characterId: 'bob', spriteId: 'b', text: '' }),
        createDialogueEntry({ id: 'e3', characterId: 'bob', spriteId: 'b', text: 'Fine.' }),
      ],
    }), 'step-talk');
    const bubbles = comicStepElements(step) as ComicBubble[];

    expect(bubbles.map(({ entryId, characterId, anchor, text: words }) => [entryId, characterId, anchor, words])).toEqual([
      ['e1', 'alice', 'step-talk/p0/s0', 'Hello. How are you?'],
      ['e3', 'bob', 'step-talk/p0/s2', 'Fine.'],
    ]);
    expect(bubbles[0]).not.toHaveProperty('speakerName');
  });

  it('puts nothing on the page for a step without words', () => {
    expect(comicStepElements(text('step-1', '   '))).toEqual([]);
    expect(comicStepElements(createCharacterStep({ characterId: 'alice' }))).toEqual([]);
    expect(comicStepElements(createChoiceStep())).toEqual([]);
  });
});

describe('inline chips go with their sentence', () => {
  it('puts a chip with the sentence after it in its block, and a chip at the end with the one before it', () => {
    const timeline = saved([{
      id: 'doc_storm',
      kind: 'text',
      content: 'It was quiet. A door slammed. Then nothing.',
      parts: [{ type: 'text', text: 'It was quiet. ' }, thunder, { type: 'text', text: 'A door slammed. Then nothing.' }, shake],
    }]);
    const elements = comicElements(timeline);

    expect(elements.map((element) => [element.anchor, element.text])).toEqual([
      ['doc_storm/p0/s0', 'It was quiet.'],
      ['doc_storm/p2/s0', 'A door slammed.'],
      ['doc_storm/p2/s1', 'Then nothing.'],
    ]);
    expect(elements.map((element) => element.cues.map((cue) => cue.kind))).toEqual([[], ['sound'], ['effect']]);
    expect(elements[1].cues[0]).toEqual({ kind: 'sound', stepId: 'sfx_thunder', mode: 'track', assetId: 'thunder.ogg' });
    expect(elements[2].cues[0]).toEqual({ kind: 'effect', stepId: 'fx_shake', effectType: 'shake', target: 'screen', intensity: 70 });
  });

  it('puts rain, snow or fog with the sentence before it, which is on screen when the novel starts it', () => {
    const rain: DocumentInlinePart = { type: 'effect', id: 'fx_rain', effectType: 'rain', target: 'screen', intensity: 50, duration: 8 };
    const timeline = saved([{
      id: 'doc_sky',
      kind: 'text',
      content: 'Clouds gathered. It poured. Then thunder.',
      parts: [
        { type: 'text', text: 'Clouds gathered. ' }, rain, { type: 'text', text: 'It poured. ' },
        thunder, { ...rain, id: 'fx_rain_again' }, { type: 'text', text: 'Then thunder.' },
      ],
    }]);

    expect(comicElements(timeline).map((element) => [element.text, element.cues.map((cue) => cue.stepId)])).toEqual([
      ['Clouds gathered.', ['fx_rain']],
      ['It poured.', []],
      ['Then thunder.', ['sfx_thunder', 'fx_rain_again']],
    ]);
  });

  it('puts a chip inside a line of dialogue with the words of the line after it', () => {
    const timeline = saved([{
      id: 'doc_says',
      kind: 'dialogue',
      characterId: 'mira',
      speakerName: 'Mira',
      spriteId: null,
      text: 'Listen. It stopped.',
      parts: [{ type: 'text', text: 'Listen. ' }, thunder, { type: 'text', text: 'It stopped.' }],
    }]);
    const bubbles = comicElements(timeline) as ComicBubble[];

    expect(bubbles.map((bubble) => [bubble.anchor, bubble.text, bubble.cues.map((cue) => cue.stepId)])).toEqual([
      ['doc_says/p0/s0', 'Listen.', []],
      ['doc_says/p2/s0', 'It stopped.', ['sfx_thunder']],
    ]);
    expect(bubbles.every((bubble) => bubble.characterId === 'mira' && bubble.style === 'normal')).toBe(true);
  });

  it('keeps a chip to its own block: none goes to the next block, and a block with no words gives its chip to none', () => {
    const timeline = saved([
      { id: 'doc_a', kind: 'text', content: 'Before.' },
      { id: 'doc_chip', kind: 'text', content: '', parts: [thunder] },
      { id: 'doc_b', kind: 'text', content: 'After.' },
    ]);

    expect(comicElements(timeline).map((element) => element.cues)).toEqual([[], []]);
    expect(comicCues(timeline).size).toBe(0);
  });

  it('reads chips saved before blocks were remembered by the line opening makes of them', () => {
    const legacy = [
      text('step-1', 'The lamp flickered.'),
      withId(createSoundStep({ assetId: 'buzz.ogg' }), 'step-2'),
      text('step-3', 'Then it went out.'),
      withId(createEffectStep({ effectType: 'flash', target: 'screen', intensity: 40 }), 'step-4'),
    ];
    const elements = comicElements(legacy);

    expect(elements.map((element) => [element.anchor, element.cues.map((cue) => cue.stepId)])).toEqual([
      ['step-1/p0/s0', []],
      ['step-3/p0/s0', ['step-2', 'step-4']],
    ]);
  });

  it('takes a chip that is switched off or has a condition for no chip, and gives no chip to a line switched off', () => {
    const timeline = [
      text('step-1', 'One.'),
      { ...withId(createSoundStep({ assetId: 'a.ogg' }), 'off'), enabled: false },
      { ...withId(createSoundStep({ assetId: 'b.ogg' }), 'if'), conditions: [{ variableName: 'x', operator: '==' as const, value: 1 }] },
      text('step-2', 'Two.'),
      withId(createSoundStep({ assetId: 'c.ogg' }), 'chip'),
      { ...text('step-3', 'Three.'), enabled: false },
    ];

    expect(comicElements(timeline).map((element) => element.cues.map((cue) => cue.stepId))).toEqual([[], ['chip'], []]);
    expect([...comicCues(timeline).keys()]).toEqual(['step-2/p0/s0']);
  });

  it('takes a standalone effect block for no chip', () => {
    const timeline = [
      text('step-1', 'One.', { originBlockId: 'doc_a' }),
      withId(createEffectStep({ effectType: 'shake' }), 'step-2', { originBlockId: 'doc_fx' }),
      text('step-3', 'Two.', { originBlockId: 'doc_b' }),
    ];
    expect(comicCues(timeline).size).toBe(0);
  });
});
