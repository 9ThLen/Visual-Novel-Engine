import { act, renderHook } from '@testing-library/react';
import {
  authorComicStops,
  buildAuthorComicPlan,
  buildComicPagePlan,
  buildExecutedComicPlan,
  type ComicExecutedStop,
  type ComicFraming,
  type ComicPagePlan,
  type ComicVisibleState,
} from '@/lib/comic/comic-layout';
import {
  createBackgroundStep,
  createCameraStep,
  createCharacterStep,
  createChoiceStep,
  createDialogueEntry,
  createDialogueStep,
  createEffectStep,
  createGotoStep,
  createLabelStep,
  createSoundStep,
  createStopEffectStep,
  createTextStep,
  createVariableStep,
} from '@/lib/engine/event-factory';
import type { CharacterBlockData, TimelineStep } from '@/lib/engine/types';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';
import { sentencePrint } from '@/lib/comic/comic-anchors';

const withId = (step: TimelineStep, id: string, origin: Partial<TimelineStep> = {}): TimelineStep => ({ ...step, id, ...origin });
const text = (id: string, content: string, origin?: Partial<TimelineStep>) => withId(createTextStep({ content }), id, origin);
const background = (id: string, assetId: string) => withId(createBackgroundStep({ assetId }), id);
const show = (id: string, characterId: string, position: CharacterBlockData['position'], spriteId = `${characterId}-calm`) =>
  withId(createCharacterStep({ action: 'show', characterId, spriteId, position }), id);
const line = (id: string, characterId: string, words: string) => withId(createDialogueStep({
  entries: [createDialogueEntry({ id: `${id}-line`, characterId, spriteId: `${characterId}-calm`, text: words })],
}), id);

const texts = (plan: ComicPagePlan) => plan.panels.map((panel) => panel.elements.map((element) => element.text));
const WIDE_EMPTY: ComicFraming = { shot: 'wide', zoom: 1, subject: { x: 0.5, y: 0.5 }, placement: { x: 0.5, y: 0.5 }, characterIds: [] };

/**
 * Reads a scene with the real executor, as the reader does, and keeps a stop
 * for every place it halts — what the execution journal of PR 2.3 records.
 */
function readThrough(timeline: TimelineStep[], initialVariables = {}): ComicExecutedStop[] {
  const { result } = renderHook(() => useSceneExecutor(timeline, { initialVariables }));
  const stops: ComicExecutedStop[] = [];
  while (!result.current.isComplete && stops.length < 50) {
    // The executor's own state is a visible state as it is.
    const state: ComicVisibleState = result.current.sceneState;
    stops.push({ executionId: `run-${stops.length + 1}`, step: timeline[result.current.currentStepIndex], state });
    if (!result.current.isTyping && !result.current.canAdvance) break;
    if (result.current.isTyping) act(() => result.current.advance());
    act(() => result.current.advance());
  }
  return stops;
}

/** A plan without the keys that name an execution, to set two ways in side by side. */
function withoutRuns(plan: ComicPagePlan) {
  return plan.panels.map(({ id: _id, elements, ...panel }) => ({
    ...panel,
    elements: elements.map(({ id: _elementId, executionId: _run, ...element }) => element),
  }));
}

describe('the author\'s plan of a scene', () => {
  it('gives every sentence of narration a panel of its own, on the whole stage', () => {
    const plan = buildAuthorComicPlan([
      background('step-bg', 'hall'),
      text('step-1', 'The hall was dark. Rain hit the windows.'),
      text('step-2', 'Nobody came.'),
    ]);

    expect(plan.panels.map((panel) => [panel.id, panel.anchor])).toEqual([
      ['step-1/p0/s0', 'step-1/p0/s0'],
      ['step-1/p0/s1', 'step-1/p0/s1'],
      ['step-2/p0/s0', 'step-2/p0/s0'],
    ]);
    expect(texts(plan)).toEqual([['The hall was dark.'], ['Rain hit the windows.'], ['Nobody came.']]);
    expect(plan.panels[0].picture).toEqual({ backgroundAssetId: 'hall', characters: [], camera: null, effects: [] });
    expect(plan.panels.every((panel) => JSON.stringify(panel.framing) === JSON.stringify(WIDE_EMPTY))).toBe(true);
    expect(plan.panels.map((panel) => panel.textWeight)).toEqual([18, 21, 12]);
  });

  it('holds narration over a cast on the third of the panel on their side', () => {
    const plan = buildAuthorComicPlan([show('step-a', 'alice', 'left'), text('step-1', 'She waited.')]);
    expect(plan.panels[0].framing).toEqual({
      shot: 'wide', zoom: 1, subject: { x: 0.25, y: 0.3 }, placement: { x: 0.333, y: 0.333 }, characterIds: ['alice'],
    });
  });

  it('makes a line of dialogue a bubble over its speaker, in close-up when short and a medium shot when not', () => {
    const plan = buildAuthorComicPlan([
      background('step-bg', 'hall'),
      show('step-a', 'alice', 'right', 'alice-smile'),
      line('step-1', 'alice', 'Who is there?'),
      text('step-2', 'No answer.'),
      line('step-3', 'alice', 'Come out now, or I will call for the keeper of the hall.'),
      text('step-4', 'Silence.'),
      line('step-5', 'alice', 'Fine.'),
    ]);
    const [short, , long, , again] = plan.panels;

    expect(short.picture.characters).toEqual([{ characterId: 'alice', spriteId: 'alice-smile', position: 'right', x: 0.75 }]);
    expect(short.elements).toEqual([expect.objectContaining({
      kind: 'bubble', style: 'speech', characterId: 'alice', spriteId: 'alice-calm', text: 'Who is there?', id: 'step-1/p0/s0',
    })]);
    expect(short.framing).toEqual({
      shot: 'close', zoom: 2.1, subject: { x: 0.75, y: 0.3 }, placement: { x: 0.667, y: 0.4 }, characterIds: ['alice'],
    });
    expect(long.framing).toMatchObject({ shot: 'medium', zoom: 1.45, placement: { x: 0.667, y: 0.333 } });
    expect(again.framing.shot).toBe('close');
  });

  it('puts two lines in a panel while the picture stays the same, and never a line with narration', () => {
    const plan = buildAuthorComicPlan([
      show('step-a', 'alice', 'left'),
      show('step-b', 'bob', 'center'),
      line('step-1', 'alice', 'Hello.'),
      line('step-2', 'bob', 'Hi.'),
      line('step-3', 'alice', 'Shall we go in?'),
      text('step-4', 'They went in.'),
      line('step-5', 'bob', 'After you.'),
      line('step-6', 'bob', 'Mind the step.'),
    ]);

    expect(texts(plan)).toEqual([['Hello.', 'Hi.'], ['Shall we go in?'], ['They went in.'], ['After you.', 'Mind the step.']]);
    expect(plan.panels[0].framing).toEqual({
      shot: 'wide', zoom: 1.176, subject: { x: 0.375, y: 0.3 }, placement: { x: 0.5, y: 0.333 }, characterIds: ['alice', 'bob'],
    });
    expect(plan.panels[3].framing).toMatchObject({ shot: 'close', characterIds: ['bob'] });
  });

  it('makes every line of a dialogue step a bubble, two to a panel', () => {
    const plan = buildAuthorComicPlan([
      show('step-a', 'alice', 'left'),
      show('step-b', 'bob', 'right'),
      withId(createDialogueStep({
        entries: [
          createDialogueEntry({ id: 'e1', characterId: 'alice', spriteId: 'a', text: 'Hi. Ready?' }),
          createDialogueEntry({ id: 'e2', characterId: 'bob', spriteId: 'b', text: 'Always.' }),
          createDialogueEntry({ id: 'e3', characterId: 'alice', spriteId: 'a', text: 'Then go.' }),
        ],
      }), 'step-talk'),
    ]);

    expect(plan.panels.map((panel) => panel.elements.map((element) => element.anchor))).toEqual([
      ['step-talk/p0/s0', 'step-talk/p0/s2'],
      ['step-talk/p0/s3'],
    ]);
    expect(plan.panels[0].framing).toMatchObject({ shot: 'wide', zoom: 1, characterIds: ['alice', 'bob'] });
  });

  it('opens a new panel when the background changes, even between two lines', () => {
    const plan = buildAuthorComicPlan([
      background('step-bg1', 'hall'),
      show('step-a', 'alice', 'left'),
      line('step-1', 'alice', 'One.'),
      background('step-bg2', 'street'),
      line('step-2', 'alice', 'Two.'),
    ]);

    expect(texts(plan)).toEqual([['One.'], ['Two.']]);
    expect(plan.panels.map((panel) => panel.picture.backgroundAssetId)).toEqual(['hall', 'street']);
  });

  it('opens a new panel when a character comes on, or the picture changes in any other way', () => {
    const plan = buildAuthorComicPlan([
      show('step-a', 'alice', 'left'),
      line('step-1', 'alice', 'Anyone here?'),
      show('step-b', 'bob', 'right'),
      line('step-2', 'alice', 'Oh. It is you.'),
      withId(createCharacterStep({ action: 'change_sprite', characterId: 'alice', spriteId: 'alice-angry' }), 'step-c'),
      line('step-3', 'alice', 'Again.'),
      withId(createCharacterStep({ action: 'hide', characterId: 'bob' }), 'step-d'),
      line('step-4', 'alice', 'Gone.'),
    ]);

    expect(texts(plan)).toEqual([['Anyone here?'], ['Oh. It is you.'], ['Again.'], ['Gone.']]);
    expect(plan.panels.map((panel) => panel.picture.characters.map((character) => `${character.characterId}:${character.spriteId}`))).toEqual([
      ['alice:alice-calm'],
      ['alice:alice-calm', 'bob:bob-calm'],
      ['alice:alice-angry', 'bob:bob-calm'],
      ['alice:alice-angry'],
    ]);
  });

  it('lets a panel nothing is put into collapse', () => {
    const plan = buildAuthorComicPlan([
      background('step-bg1', 'night'),
      background('step-bg2', 'dawn'),
      text('step-1', '   '),
      withId(createDialogueStep({ entries: [createDialogueEntry({ characterId: 'alice', text: '' })] }), 'step-2'),
      withId(createChoiceStep(), 'step-3'),
      text('step-4', 'At last.'),
    ]);

    expect(plan.panels).toHaveLength(1);
    expect(plan.panels[0]).toMatchObject({ id: 'step-4/p0/s0', picture: { backgroundAssetId: 'dawn' } });
    expect(buildAuthorComicPlan([background('step-bg', 'night'), show('step-a', 'alice', 'left')])).toEqual({ panels: [] });
    expect(buildAuthorComicPlan([])).toEqual({ panels: [] });
  });

  it('carries inline chips into the panel of their sentence', () => {
    const plan = buildAuthorComicPlan([
      text('step-1', 'Quiet. ', { originBlockId: 'doc_a', originPart: 0 }),
      withId(createSoundStep({ assetId: 'bang.ogg' }), 'step-2', { originBlockId: 'doc_a', originPart: 1 }),
      text('step-3', 'Bang.', { originBlockId: 'doc_a', originPart: 2 }),
    ]);

    expect(plan.panels.map((panel) => [panel.id, panel.elements[0].cues])).toEqual([
      ['doc_a/p0/s0', []],
      ['doc_a/p2/s0', [{ kind: 'sound', stepId: 'step-2', mode: 'track', assetId: 'bang.ogg' }]],
    ]);
  });

  it('addresses the panels of a scene saved before blocks were remembered by its steps\' ids', () => {
    const legacy = [text('step-1', 'First. Second.'), line('step-2', 'alice', 'Third.')];
    const remembered = legacy.map((step, index) => ({ ...step, id: `fresh-${index}`, originBlockId: `doc_${index}` }));

    expect(buildAuthorComicPlan(legacy).panels.map((panel) => panel.id)).toEqual(['step-1/p0/s0', 'step-1/p0/s1', 'step-2/p0/s0']);
    expect(buildAuthorComicPlan(remembered).panels.map((panel) => panel.id)).toEqual(['doc_0/p0/s0', 'doc_0/p0/s1', 'doc_1/p0/s0']);
  });

  it('frames with the author\'s camera while it is away from rest', () => {
    const plan = buildAuthorComicPlan([
      show('step-a', 'alice', 'left'),
      show('step-b', 'bob', 'right'),
      withId(createCameraStep({ action: 'focus', target: 'alice', zoomLevel: 1.6 }), 'step-cam'),
      line('step-1', 'bob', 'Look at her.'),
      withId(createCameraStep({ action: 'reset' }), 'step-reset'),
      line('step-2', 'bob', 'Look at me.'),
    ]);

    expect(plan.panels[0].picture.camera).toEqual({ zoomLevel: 1.6, panX: 0, panY: 0, target: 'alice' });
    expect(plan.panels[0].framing).toEqual({
      shot: 'medium', zoom: 1.6, subject: { x: 0.25, y: 0.3 }, placement: { x: 0.5, y: 0.333 }, characterIds: ['alice'],
    });
    expect(plan.panels[1].picture.camera).toBeNull();
    expect(plan.panels[1].framing).toMatchObject({ shot: 'close', characterIds: ['bob'] });
  });

  it('draws the effects that last, from the line before them when the novel sets them up ahead', () => {
    const plan = buildAuthorComicPlan([
      text('step-1', 'Clouds gathered.'),
      withId(createEffectStep({ effectType: 'rain', intensity: 60 }), 'step-rain'),
      withId(createEffectStep({ effectType: 'shake' }), 'step-shake'),
      text('step-2', 'Thunder.'),
      withId(createStopEffectStep({ effectType: 'rain' }), 'step-stop'),
      text('step-3', 'It cleared.'),
    ]);

    expect(plan.panels.map((panel) => panel.picture.effects)).toEqual([
      [{ effectType: 'rain', target: 'screen', intensity: 60 }],
      [{ effectType: 'rain', target: 'screen', intensity: 60 }],
      [],
    ]);
    // Saved before blocks were remembered, the three open as one line with two chips in it.
    expect(plan.panels.map((panel) => panel.elements[0].cues.map((cue) => cue.stepId))).toEqual([['step-rain'], ['step-shake'], []]);
    expect(authorComicStops([text('step-1', 'One.'), { ...text('step-2', 'Off.'), enabled: false }]).map((stop) => stop.step.id)).toEqual(['step-1']);
  });

  it('gives the same plan for the same scene, as plain data', () => {
    const scene = () => [
      background('step-bg', 'hall'),
      show('step-a', 'alice', 'left'),
      show('step-b', 'bob', 'far-right'),
      text('step-1', 'Night. The hall was cold.'),
      line('step-2', 'alice', 'Who is there?'),
      line('step-3', 'bob', 'Only me.'),
      withId(createEffectStep({ effectType: 'snow' }), 'step-snow'),
      withId(createCameraStep({ action: 'zoom', zoomLevel: 2 }), 'step-cam'),
      line('step-4', 'alice', 'You came back.'),
    ];
    const plan = buildAuthorComicPlan(scene());

    expect(buildAuthorComicPlan(scene())).toStrictEqual(plan);
    expect(JSON.parse(JSON.stringify(plan))).toStrictEqual(plan);
    expect(plan.panels.at(-1)).toStrictEqual({
      id: 'step-4/p0/s0',
      anchor: 'step-4/p0/s0',
      picture: {
        backgroundAssetId: 'hall',
        characters: [
          { characterId: 'alice', spriteId: 'alice-calm', position: 'left', x: 0.25 },
          { characterId: 'bob', spriteId: 'bob-calm', position: 'far-right', x: 0.9 },
        ],
        camera: { zoomLevel: 2, panX: 0, panY: 0 },
        effects: [{ effectType: 'snow', target: 'screen', intensity: 50 }],
      },
      framing: { shot: 'close', zoom: 2, subject: { x: 0.5, y: 0.5 }, placement: { x: 0.5, y: 0.5 }, characterIds: [] },
      elements: [{
        kind: 'bubble',
        style: 'speech',
        anchor: 'step-4/p0/s0',
        stepId: 'step-4',
        text: 'You came back.',
        sentences: [{ anchor: 'step-4/p0/s0', text: 'You came back.' }],
        cues: [],
        entryId: 'step-4-line',
        characterId: 'alice',
        spriteId: 'alice-calm',
        id: 'step-4/p0/s0',
      }],
      textWeight: 14,
    });
  });
});

describe('the plan of what was read', () => {
  it('draws a step run again by a goto as a second panel further down, and none for a step jumped over', () => {
    const timeline = [
      withId(createLabelStep({ name: 'top' }), 'step-top'),
      text('step-1', 'The clock struck.'),
      withId(createVariableStep({ variableName: 'laps', operation: 'add', value: 1 }), 'step-lap'),
      withId(createGotoStep({ targetLabel: 'top', condition: { variableName: 'laps', operator: '<', value: 2 } }), 'step-again'),
      withId(createGotoStep({ targetLabel: 'end' }), 'step-skip'),
      text('step-2', 'Never read.'),
      withId(createLabelStep({ name: 'end' }), 'step-end'),
      text('step-3', 'Silence.'),
    ];
    const stops = readThrough(timeline, { laps: 0 });
    const plan = buildExecutedComicPlan(timeline, stops);

    expect(stops.map((stop) => stop.step.id)).toEqual(['step-1', 'step-1', 'step-3']);
    expect(texts(plan)).toEqual([['The clock struck.'], ['The clock struck.'], ['Silence.']]);
    expect(plan.panels.map((panel) => [panel.id, panel.anchor])).toEqual([
      ['run-1:step-1/p0/s0', 'step-1/p0/s0'],
      ['run-2:step-1/p0/s0', 'step-1/p0/s0'],
      ['run-3:step-3/p0/s0', 'step-3/p0/s0'],
    ]);
    expect(plan.panels[1].elements[0]).toMatchObject({ id: 'run-2:step-1/p0/s0', executionId: 'run-2' });
  });

  it('draws each stop from its own snapshot, and pairs lines of a repeated exchange again', () => {
    const hall: ComicVisibleState = {
      backgroundAssetId: 'hall',
      characters: [
        { characterId: 'alice', spriteId: 'alice-calm', position: 'left', visible: true },
        { characterId: 'bob', spriteId: 'bob-calm', position: 'right', visible: true },
      ],
      activeEffects: [],
    };
    const street: ComicVisibleState = { ...hall, backgroundAssetId: 'street' };
    const ask = line('step-1', 'alice', 'Again?');
    const answer = line('step-2', 'bob', 'Again.');
    const stops: ComicExecutedStop[] = [
      { executionId: 'x1', step: ask, state: hall },
      { executionId: 'x2', step: answer, state: hall },
      { executionId: 'x3', step: withId(createChoiceStep(), 'step-3'), state: hall },
      { executionId: 'x4', step: ask, state: street },
      { executionId: 'x5', step: answer, state: street },
    ];
    const plan = buildExecutedComicPlan([ask, answer], stops);

    expect(plan.panels.map((panel) => [panel.id, panel.picture.backgroundAssetId, panel.elements.map((element) => element.executionId)])).toEqual([
      ['x1:step-1/p0/s0', 'hall', ['x1', 'x2']],
      ['x4:step-1/p0/s0', 'street', ['x4', 'x5']],
    ]);
  });

  it('keeps a key of its own for a sentence addressed twice', () => {
    const twin = text('step-1', 'Twice.');
    const plan = buildAuthorComicPlan([twin, { ...twin }]);
    expect(plan.panels.map((panel) => panel.id)).toEqual(['step-1/p0/s0', 'step-1/p0/s0~2']);
  });

  it('gives what was read of a straight scene the same panels as the author\'s plan', () => {
    const timeline = [
      background('step-bg', 'hall'),
      show('step-a', 'alice', 'left'),
      text('step-1', 'The hall was cold. Rain began.'),
      withId(createEffectStep({ effectType: 'rain', intensity: 40 }), 'step-rain'),
      show('step-b', 'bob', 'right'),
      line('step-2', 'bob', 'Who is there?'),
      line('step-3', 'alice', 'Only me. I came back for the book you left on the shelf by the door.'),
      withId(createCameraStep({ action: 'focus', target: 'alice', zoomLevel: 1.6 }), 'step-cam'),
      line('step-4', 'alice', 'Look.'),
      withId(createStopEffectStep({ effectType: 'rain' }), 'step-stop'),
      withId(createCameraStep({ action: 'reset' }), 'step-reset'),
      withId(createCharacterStep({ action: 'hide', characterId: 'bob' }), 'step-hide'),
      background('step-bg2', 'street'),
      text('step-5', 'Morning came.'),
    ];
    const read = buildComicPagePlan(timeline, readThrough(timeline));
    const authored = buildAuthorComicPlan(timeline);

    expect(withoutRuns(read)).toEqual(withoutRuns(authored));
    expect(texts(authored)).toEqual([
      ['The hall was cold.'],
      ['Rain began.'],
      ['Who is there?', 'Only me. I came back for the book you left on the shelf by the door.'],
      ['Look.'],
      ['Morning came.'],
    ]);
    expect(authored.panels[1].picture.effects).toEqual([{ effectType: 'rain', target: 'screen', intensity: 40 }]);
    expect(read.panels.map((panel) => panel.id)).toEqual([
      'run-1:step-1/p0/s0', 'run-1:step-1/p0/s1', 'run-2:step-2/p0/s0', 'run-4:step-4/p0/s0', 'run-5:step-5/p0/s0',
    ]);
  });
});

describe('the author\'s edits of the panels', () => {
  // Two lines that share a panel, then two sentences of narration.
  const scene = [
    background('bg', 'hall'),
    show('on-ann', 'ann', 'left'),
    show('on-bo', 'bo', 'right'),
    line('l1', 'ann', 'Who is there?'),
    line('l2', 'bo', 'Only me.'),
    text('n1', 'The wind rose. A door slammed.'),
  ];
  const at = (anchor: string, words: string) => ({ anchor, print: sentencePrint(words) });
  const automatic = [['Who is there?', 'Only me.'], ['The wind rose.'], ['A door slammed.']];

  it('lays a scene out as before when it has no edits', () => {
    expect(buildAuthorComicPlan(scene, { presentation: 'comic' })).toEqual(buildAuthorComicPlan(scene));
    expect(texts(buildAuthorComicPlan(scene))).toEqual(automatic);
  });

  it('opens a panel with the line a ✂ is on', () => {
    const plan = buildAuthorComicPlan(scene, { breaks: [at('l2/p0/s0', 'Only me.')] });
    expect(texts(plan)).toEqual([['Who is there?'], ['Only me.'], ['The wind rose.'], ['A door slammed.']]);
  });

  it('joins the panel a × is on to the panel before it, narration and dialogue alike', () => {
    expect(texts(buildAuthorComicPlan(scene, { merges: [at('n1/p0/s0', 'The wind rose.')] })))
      .toEqual([['Who is there?', 'Only me.', 'The wind rose.'], ['A door slammed.']]);
    expect(texts(buildAuthorComicPlan(scene, { merges: [at('n1/p0/s1', 'A door slammed.')] })))
      .toEqual([['Who is there?', 'Only me.'], ['The wind rose.', 'A door slammed.']]);
  });

  it('keeps the first panel\'s picture when a × joins a panel with another', () => {
    const changing = [background('bg-1', 'hall'), text('a', 'Inside.'), background('bg-2', 'yard'), text('b', 'Outside.')];
    const plan = buildAuthorComicPlan(changing, { merges: [at('b/p0/s0', 'Outside.')] });

    expect(texts(plan)).toEqual([['Inside.', 'Outside.']]);
    expect(plan.panels[0].picture.backgroundAssetId).toBe('hall');
  });

  it('lets ✂ and × on one line cancel out, and a × on the first line do nothing', () => {
    const both = { breaks: [at('l2/p0/s0', 'Only me.')], merges: [at('l2/p0/s0', 'Only me.')] };
    expect(texts(buildAuthorComicPlan(scene, both))).toEqual(automatic);
    expect(texts(buildAuthorComicPlan(scene, { merges: [at('l1/p0/s0', 'Who is there?')] }))).toEqual(automatic);
  });

  it('gives a panel the author\'s shot, focus and size', () => {
    const plan = buildAuthorComicPlan(scene, {
      panels: [{ ...at('n1/p0/s1', 'A door slammed.'), shot: 'dramatic', focus: { x: 0.2, y: 0.4 }, size: 'half' }],
    });
    const panel = plan.panels[2];

    expect(panel.framing).toMatchObject({ shot: 'dramatic', zoom: 2.8, subject: { x: 0.2, y: 0.4 }, placement: { x: 0.5, y: 0.5 } });
    expect(panel.size).toBe('half');
    expect(plan.panels[1]).not.toHaveProperty('size');
  });

  it('keeps the automatic subject when only the shot is the author\'s', () => {
    const auto = buildAuthorComicPlan(scene).panels[0].framing;
    const plan = buildAuthorComicPlan(scene, { panels: [{ ...at('l1/p0/s0', 'Who is there?'), shot: 'wide' }] });

    expect(plan.panels[0].framing).toEqual({ ...auto, shot: 'wide', zoom: 1 });
  });

  it('finds a panel\'s settings on any of its lines, so a × does not lose them', () => {
    const plan = buildAuthorComicPlan(scene, {
      merges: [at('n1/p0/s0', 'The wind rose.')],
      panels: [{ ...at('n1/p0/s0', 'The wind rose.'), shot: 'close' }],
    });
    expect(plan.panels[0].framing.shot).toBe('close');
  });

  it('draws a line as the kind of bubble the author picked, with the tail on their side', () => {
    const plan = buildAuthorComicPlan(scene, {
      elements: [{ ...at('l1/p0/s0', 'Who is there?'), style: 'shout', tail: 'left' }, { ...at('n1/p0/s0', 'The wind rose.'), style: 'thought' }],
    });

    expect(plan.panels[0].elements[0]).toMatchObject({ kind: 'bubble', style: 'shout', tail: 'left' });
    expect(plan.panels[0].elements[1]).toMatchObject({ kind: 'bubble', style: 'speech' });
    expect(plan.panels[0].elements[1]).not.toHaveProperty('tail');
    expect(plan.panels[1].elements[0]).toMatchObject({ kind: 'caption', style: 'thought' });
    expect(plan.panels[2].elements[0]).not.toHaveProperty('style');
  });

  it('follows its sentence when words are written before it', () => {
    const edited = [...scene.slice(0, 5), text('n1', 'The wind rose. Then silence. A door slammed.')];
    const plan = buildAuthorComicPlan(edited, { panels: [{ ...at('n1/p0/s1', 'A door slammed.'), shot: 'close' }] });

    expect(plan.panels.map((panel) => panel.framing.shot)).toEqual([buildAuthorComicPlan(edited).panels[0].framing.shot, 'wide', 'wide', 'close']);
  });

  it('does nothing where its sentence is gone', () => {
    const plan = buildAuthorComicPlan(scene, { breaks: [at('l2/p0/s0', 'A line nobody wrote anywhere at all.')] });
    expect(texts(plan)).toEqual(automatic);
  });

  describe('inside a line of dialogue', () => {
    const talk = [
      background('bg', 'hall'),
      show('on-ann', 'ann', 'left'),
      line('l1', 'ann', 'First sentence. Second sentence. Third sentence.'),
      line('l2', 'ann', 'Done.'),
    ];

    it('splits the line where a ✂ is: the rest goes on in a bubble of its own, in the next panel', () => {
      expect(texts(buildAuthorComicPlan(talk))).toEqual([['First sentence. Second sentence. Third sentence.', 'Done.']]);

      const plan = buildAuthorComicPlan(talk, { breaks: [at('l1/p0/s1', 'Second sentence.')] });
      expect(texts(plan)).toEqual([['First sentence.'], ['Second sentence. Third sentence.', 'Done.']]);
      const [first, rest] = plan.panels.flatMap((panel) => panel.elements);
      expect([first, rest].map((element) => [element.kind, element.anchor, element.id, element.kind === 'bubble' && element.characterId]))
        .toEqual([['bubble', 'l1/p0/s0', 'l1/p0/s0', 'ann'], ['bubble', 'l1/p0/s1', 'l1/p0/s1', 'ann']]);
    });

    it('splits it at every ✂, and keeps each piece\'s kind of bubble apart', () => {
      const plan = buildAuthorComicPlan(talk, {
        breaks: [at('l1/p0/s1', 'Second sentence.'), at('l1/p0/s2', 'Third sentence.')],
        elements: [{ ...at('l1/p0/s2', 'Third sentence.'), style: 'shout' }],
      });

      expect(texts(plan)).toEqual([['First sentence.'], ['Second sentence.'], ['Third sentence.', 'Done.']]);
      expect(plan.panels.flatMap((panel) => panel.elements).map((element) => element.kind === 'bubble' && element.style))
        .toEqual(['speech', 'speech', 'shout', 'speech']);
    });

    it('does nothing with a × after the line\'s first sentence: it is in the line\'s panel already', () => {
      expect(texts(buildAuthorComicPlan(talk, { merges: [at('l1/p0/s1', 'Second sentence.')] })))
        .toEqual(texts(buildAuthorComicPlan(talk)));
    });

    it('splits what was read the same way', () => {
      const settings = { breaks: [at('l1/p0/s1', 'Second sentence.')] };
      expect(withoutRuns(buildExecutedComicPlan(talk, readThrough(talk), settings)))
        .toEqual(withoutRuns(buildAuthorComicPlan(talk, settings)));
    });
  });

  it('draws what was read with the same edits', () => {
    const settings = { breaks: [at('l2/p0/s0', 'Only me.')], panels: [{ ...at('n1/p0/s0', 'The wind rose.'), size: 'full' as const }] };
    const read = buildExecutedComicPlan(scene, readThrough(scene), settings);

    expect(withoutRuns(read)).toEqual(withoutRuns(buildAuthorComicPlan(scene, settings)));
    expect(read.panels[2].size).toBe('full');
  });
});
