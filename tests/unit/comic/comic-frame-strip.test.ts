import { sentencePrint } from '@/lib/comic/comic-anchors';
import { comicFrameStrip, comicPlanPictures, type ComicFrameAssets } from '@/lib/comic/comic-frame-strip';
import { buildAuthorComicPlan, type ComicPagePlan } from '@/lib/comic/comic-layout';
import type { SceneComicSettings, TimelineStep } from '@/lib/engine/types';

function step(id: string, blockType: TimelineStep['blockType'], data: Record<string, unknown>): TimelineStep {
  return { id, blockType, data, collapsed: false, enabled: true } as unknown as TimelineStep;
}

const timeline: TimelineStep[] = [
  step('bg', 'background', { assetId: 'media:hall', transition: 'fade', duration: 0 }),
  step('ann-on', 'character', { characterId: 'ann', spriteId: 'ann-smile', action: 'show', position: 'left' }),
  step('words', 'text', { content: 'The hall was quiet.', typewriterSpeed: 0.5, anchorTo: 'background' }),
  step('line', 'dialogue', { entries: [{ id: 'e1', characterId: 'ann', text: 'Hello?', spriteId: 'ann-smile' }], currentEntryIndex: 0 }),
  step('named', 'dialogue', { entries: [{ id: 'e2', characterId: 'ann', speakerName: 'A voice', text: 'Who is there?', spriteId: 'ann-smile' }], currentEntryIndex: 0 }),
];

const plan: ComicPagePlan = buildAuthorComicPlan(timeline);

function assets(resolved: Record<string, string> = {}): ComicFrameAssets {
  return {
    imageUrl: (ref) => resolved[ref] ?? null,
    spriteRef: (characterId, spriteId) => (characterId === 'ann' ? `media:${spriteId}` : null),
    characterName: (characterId) => (characterId === 'ann' ? 'Ann' : null),
  };
}

describe('a page plan as the frame draws it', () => {
  it('needs the backgrounds and the sprites of its panels, each once, and knows which is which', () => {
    const pictures = comicPlanPictures(plan, assets()).sort((a, b) => a.ref.localeCompare(b.ref));
    expect(pictures).toEqual([
      { ref: 'media:ann-smile', roles: ['sprite'] },
      { ref: 'media:hall', roles: ['background'] },
    ]);
  });

  it('remembers every way a picture is drawn, for the size of its copy', () => {
    const both = assets();
    both.spriteRef = () => 'media:hall';
    expect(comicPlanPictures(plan, both)).toEqual([{ ref: 'media:hall', roles: ['background', 'sprite'] }]);
  });

  it('draws a picture once it is resolved, and nothing for it before', () => {
    const before = comicFrameStrip(plan, assets());
    expect(before.panels[0].background).toBeNull();
    expect(before.panels[0].sprites).toEqual([expect.objectContaining({ id: 'ann', url: null })]);

    const after = comicFrameStrip(plan, assets({ 'media:hall': 'blob:hall', 'media:ann-smile': 'blob:ann' }));
    expect(after.panels[0].background).toBe('blob:hall');
    expect(after.panels[0].sprites[0].url).toBe('blob:ann');
  });

  it('keeps the words as captions and bubbles, a bubble under the name its line was written under or else its speaker\'s', () => {
    const words = comicFrameStrip(plan, assets()).panels.flatMap((panel) => panel.words);

    expect(words.map((item) => [item.kind, item.text, item.speaker])).toEqual([
      ['caption', 'The hall was quiet.', undefined],
      ['bubble', 'Hello?', 'Ann'],
      ['bubble', 'Who is there?', 'A voice'],
    ]);
    expect(words[1].speakerX).toBeCloseTo(plan.panels.find((panel) => panel.elements.some((element) => element.text === 'Hello?'))!
      .picture.characters[0].x);
  });

  it('keeps the plan\'s keys, so the frame can keep what it has drawn', () => {
    const strip = comicFrameStrip(plan, assets());
    expect(strip.panels.map((panel) => panel.id)).toEqual(plan.panels.map((panel) => panel.id));
    expect(comicFrameStrip(plan, assets()).panels).toEqual(strip.panels);
  });

  it('opens every panel unless told how far the reader has got, and never more than there are', () => {
    expect(comicFrameStrip(plan, assets()).revealed).toBe(plan.panels.length);
    expect(comicFrameStrip(plan, assets(), { revealed: 1 }).revealed).toBe(1);
    expect(comicFrameStrip(plan, assets(), { revealed: 99 }).revealed).toBe(plan.panels.length);
    expect(comicFrameStrip(plan, assets(), { revealed: -3 }).revealed).toBe(0);
  });

  it('carries the author\'s panel size, kind of words and tail to the frame', () => {
    const settings: SceneComicSettings = {
      panels: [{ anchor: 'line/p0/s0', print: sentencePrint('Hello?'), size: 'half' }],
      elements: [
        { anchor: 'words/p0/s0', print: sentencePrint('The hall was quiet.'), style: 'thought' },
        { anchor: 'line/p0/s0', print: sentencePrint('Hello?'), style: 'shout', tail: 'right' },
        // Speech is what a bubble is anyway: nothing to tell the frame.
        { anchor: 'named/p0/s0', print: sentencePrint('Who is there?'), style: 'speech' },
      ],
    };
    const edited = comicFrameStrip(buildAuthorComicPlan(timeline, settings), assets());

    expect(edited.panels.map((panel) => panel.size)).toEqual([undefined, 'half']);
    expect(edited.panels.flatMap((panel) => panel.words.map(({ text, style, tail }) => ({ text, style, tail })))).toEqual([
      { text: 'The hall was quiet.', style: 'thought', tail: undefined },
      { text: 'Hello?', style: 'shout', tail: 'right' },
      { text: 'Who is there?', style: undefined, tail: undefined },
    ]);
  });

  it('tells the frame nothing of sizes, kinds or tails where the author changed nothing', () => {
    expect(JSON.stringify(comicFrameStrip(plan, assets()))).not.toMatch(/"(size|style|tail|more)"/);
  });

  it('carries the author\'s marks with every panel\'s and sentence\'s anchor, and only when asked', () => {
    const marks = { breakLabel: 'Cut', mergeLabel: 'Join' };
    const strip = comicFrameStrip(plan, assets(), { marks });

    expect(strip.marks).toEqual(marks);
    expect(strip.panels.map((panel) => panel.anchor)).toEqual(plan.panels.map((panel) => panel.anchor));
    expect(strip.panels.flatMap((panel) => panel.words.map((words) => words.sentences))).toEqual(
      plan.panels.flatMap((panel) => panel.elements.map((element) => element.sentences.map(({ anchor, text }) => ({ anchor, text })))),
    );
    expect(JSON.stringify(comicFrameStrip(plan, assets()))).not.toMatch(/"(marks|anchor|sentences)"/);
  });

  it('says more panels may come only when told the strip is being read', () => {
    expect(comicFrameStrip(plan, assets(), { more: true }).more).toBe(true);
    expect(comicFrameStrip(plan, assets()).more).toBeUndefined();
  });

  it('carries a choice to the end of the strip', () => {
    const choices = { options: [{ id: 'a', text: 'Go' }], chosenId: null };
    expect(comicFrameStrip(plan, assets(), { choices }).choices).toEqual(choices);
    expect(comicFrameStrip(plan, assets()).choices).toBeNull();
  });
});
