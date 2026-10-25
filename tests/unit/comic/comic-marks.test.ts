import { sentencePrint } from '@/lib/comic/comic-anchors';
import { buildAuthorComicPlan, type ComicPagePlan } from '@/lib/comic/comic-layout';
import { beginsPanel, withPanelStartAt } from '@/lib/comic/comic-marks';
import {
  createBackgroundStep,
  createCharacterStep,
  createDialogueEntry,
  createDialogueStep,
  createTextStep,
} from '@/lib/engine/event-factory';
import type { CharacterBlockData, SceneComicSettings, TimelineStep } from '@/lib/engine/types';

const withId = (step: TimelineStep, id: string): TimelineStep => ({ ...step, id });
const text = (id: string, content: string) => withId(createTextStep({ content }), id);
const background = (id: string, assetId: string) => withId(createBackgroundStep({ assetId }), id);
const show = (id: string, characterId: string, position: CharacterBlockData['position']) =>
  withId(createCharacterStep({ action: 'show', characterId, spriteId: `${characterId}-calm`, position }), id);
const line = (id: string, characterId: string, words: string) => withId(createDialogueStep({
  entries: [createDialogueEntry({ id: `${id}-line`, characterId, spriteId: `${characterId}-calm`, text: words })],
}), id);
const texts = (plan: ComicPagePlan) => plan.panels.map((panel) => panel.elements.map((element) => element.text));
const at = (anchor: string, words: string) => ({ anchor, print: sentencePrint(words) });

// Two lines that share a panel, then two sentences of narration, a panel each.
const scene = [
  background('bg', 'hall'),
  show('on-ann', 'ann', 'left'),
  show('on-bo', 'bo', 'right'),
  line('l1', 'ann', 'Who is there?'),
  line('l2', 'bo', 'Only me.'),
  text('n1', 'The wind rose. A door slammed.'),
];
const automatic = [['Who is there?', 'Only me.'], ['The wind rose.'], ['A door slammed.']];
const plan = (settings?: SceneComicSettings) => texts(buildAuthorComicPlan(scene, settings));

describe('the author\'s ✂ and ×', () => {
  it('✂ starts a panel at a line the automatic panels put with the one before', () => {
    const settings = withPanelStartAt({ presentation: 'comic' }, scene, 'l2/p0/s0', true);
    expect(settings).toEqual({ presentation: 'comic', breaks: [at('l2/p0/s0', 'Only me.')] });
    expect(plan(settings)).toEqual([['Who is there?'], ['Only me.'], ['The wind rose.'], ['A door slammed.']]);
  });

  it('× joins a panel to the one before', () => {
    const settings = withPanelStartAt(undefined, scene, 'n1/p0/s1', false);
    expect(settings).toEqual({ merges: [at('n1/p0/s1', 'A door slammed.')] });
    expect(plan(settings)).toEqual([['Who is there?', 'Only me.'], ['The wind rose.', 'A door slammed.']]);
  });

  it('× on a boundary a ✂ made takes the ✂ away, and adds nothing', () => {
    const split = withPanelStartAt(undefined, scene, 'l2/p0/s0', true);
    const joined = withPanelStartAt(split, scene, 'l2/p0/s0', false);
    expect(joined).toEqual({});
    expect(plan(joined)).toEqual(automatic);
  });

  it('✂ on a sentence a × joined takes the × away, and adds nothing', () => {
    const joined = withPanelStartAt(undefined, scene, 'n1/p0/s1', false);
    expect(withPanelStartAt(joined, scene, 'n1/p0/s1', true)).toEqual({});
  });

  it('× where a ✂ stands and the automatic panels split anyway takes the ✂ away and joins', () => {
    // A caption always starts a panel: the ✂ on it changes nothing, and the × still has to join.
    const settings: SceneComicSettings = { breaks: [at('n1/p0/s1', 'A door slammed.')] };
    const joined = withPanelStartAt(settings, scene, 'n1/p0/s1', false);
    expect(joined).toEqual({ merges: [at('n1/p0/s1', 'A door slammed.')] });
    expect(beginsPanel(scene, joined, 'n1/p0/s1')).toBe(false);
  });

  it('changes nothing where the sentence already is as asked, or the scene has no such sentence', () => {
    const settings: SceneComicSettings = { presentation: 'comic' };
    expect(withPanelStartAt(settings, scene, 'n1/p0/s0', true)).toBe(settings);
    expect(withPanelStartAt(settings, scene, 'l2/p0/s0', false)).toBe(settings);
    expect(withPanelStartAt(settings, scene, 'gone/p0/s0', true)).toBe(settings);
  });

  it('✂ inside a line of dialogue splits the line there', () => {
    const talk = [background('bg', 'hall'), show('on-ann', 'ann', 'left'), line('l1', 'ann', 'First. Second.')];
    const settings = withPanelStartAt(undefined, talk, 'l1/p0/s1', true);

    expect(settings).toEqual({ breaks: [at('l1/p0/s1', 'Second.')] });
    expect(texts(buildAuthorComicPlan(talk, settings))).toEqual([['First.'], ['Second.']]);
    expect(withPanelStartAt(settings, talk, 'l1/p0/s1', false)).toEqual({});
  });

  it('keeps every other edit as it was', () => {
    const settings: SceneComicSettings = {
      presentation: 'comic',
      merges: [at('n1/p0/s1', 'A door slammed.')],
      panels: [{ ...at('l1/p0/s0', 'Who is there?'), shot: 'close' }],
    };
    expect(withPanelStartAt(settings, scene, 'l2/p0/s0', true)).toEqual({ ...settings, breaks: [at('l2/p0/s0', 'Only me.')] });
  });
});
