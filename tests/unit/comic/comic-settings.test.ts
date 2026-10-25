import { addressSentences, sentencePrint } from '@/lib/comic/comic-anchors';
import { buildAuthorComicPlan } from '@/lib/comic/comic-layout';
import { sanitizeSceneComicSettings, withSavedComicSettings, withSceneComicSettings } from '@/lib/comic/comic-presentation';
import {
  comicEditsOf,
  countComicEdits,
  hasComicEdits,
  rebindComicSettings,
  resolveComicSettings,
  withComicEditFastened,
  withComicEdits,
  withoutComicEdit,
  withElementEdit,
  withoutPanelEdits,
  withPanelEdit,
} from '@/lib/comic/comic-settings';
import { documentSceneToTimelineWithOrigins, sceneRecordToDocumentScene } from '@/lib/document-editor/document-scene';
import type { DocumentBlock, DocumentScene } from '@/lib/document-editor/types';
import { saveDocumentSceneToRecord } from '@/lib/document-scene-persistence';
import type { SceneComicSettings, SceneRecord } from '@/lib/engine/types';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';

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
function save(scene: SceneRecord, blocks: DocumentBlock[]): SceneRecord {
  const document: DocumentScene = { sceneId: scene.id, sceneName: scene.name, blocks };
  const normalized = normalizePlateDocumentScene(document, []);
  return saveDocumentSceneToRecord(scene, normalized.scene, normalized.characters);
}

const at = (anchor: string, words: string) => ({ anchor, print: sentencePrint(words) });

describe('the author\'s comic edits as they are kept', () => {
  it('keeps every kind of edit, with how the scene is read', () => {
    const settings = {
      presentation: 'comic',
      breaks: [at('b/p0/s1', 'Two.')],
      merges: [at('b/p0/s2', 'Three.')],
      panels: [{ ...at('b/p0/s0', 'One.'), shot: 'close', focus: { x: 0.25, y: 0.5 }, size: 'half' }],
      elements: [{ ...at('b/p0/s0', 'One.'), style: 'whisper', tail: 'right' }],
    };
    expect(sanitizeSceneComicSettings(settings)).toEqual(settings);
  });

  it('leaves out what it cannot read, and what would change nothing', () => {
    expect(sanitizeSceneComicSettings({
      breaks: [{ anchor: 'not an anchor' }, { print: 'no anchor' }, 'b/p0/s1', { anchor: 'b/p0/s1', print: 7 }],
      panels: [
        { anchor: 'b/p0/s0', shot: 'extreme', size: 'auto' },
        { anchor: 'b/p0/s1', focus: { x: 2, y: -1 }, size: 'enormous' },
        { anchor: 'b/p0/s2', focus: { x: 'left', y: 0 } },
      ],
      elements: [{ anchor: 'b/p0/s0', style: 'scream', tail: 'auto' }],
      layout: { pages: [] },
    })).toEqual({
      breaks: [{ anchor: 'b/p0/s1' }],
      panels: [{ anchor: 'b/p0/s1', focus: { x: 1, y: 0 } }],
    });
    expect(sanitizeSceneComicSettings({ breaks: [], panels: [{ anchor: 'b/p0/s0' }] })).toBeUndefined();
  });

  it('keeps the later of two edits fastened to one sentence', () => {
    expect(sanitizeSceneComicSettings({
      panels: [{ anchor: 'b/p0/s0', shot: 'close' }, { anchor: 'b/p0/s1', size: 'full' }, { anchor: 'b/p0/s0', shot: 'wide' }],
    })?.panels).toEqual([{ anchor: 'b/p0/s1', size: 'full' }, { anchor: 'b/p0/s0', shot: 'wide' }]);
  });

  it('writes edits to a record and tells two sets of edits with one presentation apart', () => {
    const record = { id: 'scene-1', comic: { presentation: 'comic' as const, breaks: [at('b/p0/s1', 'Two.')] } };

    expect(withSceneComicSettings(record, { presentation: 'comic', breaks: [at('b/p0/s1', 'Two.')] })).toBe(record);
    expect(withSceneComicSettings(record, { presentation: 'comic', breaks: [at('b/p0/s2', 'Three.')] }).comic?.breaks)
      .toEqual([at('b/p0/s2', 'Three.')]);
    // Edits stay when the scene goes back to Auto.
    expect(withSceneComicSettings(record, { ...record.comic, presentation: 'auto' }).comic).toEqual({ breaks: [at('b/p0/s1', 'Two.')] });
  });

  it('knows when a scene has edits', () => {
    expect(hasComicEdits(undefined)).toBe(false);
    expect(hasComicEdits({ presentation: 'comic' })).toBe(false);
    expect(hasComicEdits({ merges: [at('b/p0/s1', 'Two.')] })).toBe(true);
  });
});

describe('the author\'s comic edits, found in the scene as it is now', () => {
  const before: DocumentBlock[] = [
    { id: 'doc_a', kind: 'text', content: 'The door creaked. Nobody came.' },
    { id: 'doc_b', kind: 'text', content: 'Rain began.' },
  ];
  const sentencesOf = (blocks: DocumentBlock[]) => addressSentences(save(emptyScene(), blocks).timeline);
  const settings: SceneComicSettings = {
    breaks: [at('doc_a/p0/s1', 'Nobody came.')],
    panels: [{ ...at('doc_b/p0/s0', 'Rain began.'), shot: 'close' }],
  };

  it('acts where its words are', () => {
    const { edits, notes } = resolveComicSettings(settings, sentencesOf(before));

    expect([...edits.breaks]).toEqual(['doc_a/p0/s1']);
    expect([...edits.panels.keys()]).toEqual(['doc_b/p0/s0']);
    expect(notes).toEqual([]);
  });

  it('follows words that moved, and is fastened there on the next save', () => {
    const after: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'Silence. The door creaked. Nobody came.' }, before[1]];
    const sentences = sentencesOf(after);

    expect([...resolveComicSettings(settings, sentences).edits.breaks]).toEqual(['doc_a/p0/s2']);
    const rebound = rebindComicSettings(settings, sentences);
    expect(rebound.breaks).toEqual([at('doc_a/p0/s2', 'Nobody came.')]);
    // The panel edit's words did not move: it is kept as it was.
    expect(rebound.panels).toEqual(settings.panels);
    expect(resolveComicSettings(rebound, sentences).notes).toEqual([]);
  });

  it('comes back as it is when nothing moved', () => {
    expect(rebindComicSettings(settings, sentencesOf(before))).toBe(settings);
    expect(rebindComicSettings(undefined, sentencesOf(before))).toBeUndefined();
  });

  it('keeps acting on words a little changed, and says so', () => {
    const typo: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'The door creaked. Nobdoy came.' }, before[1]];
    const { edits, notes } = resolveComicSettings(settings, sentencesOf(typo));

    expect([...edits.breaks]).toEqual(['doc_a/p0/s1']);
    expect(notes).toEqual([{ kind: 'breaks', edit: settings.breaks![0], status: 'changed', anchor: 'doc_a/p0/s1' }]);
    // A changed edit is not rewritten: Issues asks the author to look.
    expect(rebindComicSettings(settings, sentencesOf(typo))).toBe(settings);
  });

  it('stops acting when its words are gone, and says so', () => {
    const gone: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'The door creaked.' }, before[1]];
    const { edits, notes } = resolveComicSettings(settings, sentencesOf(gone));

    expect(edits.breaks.size).toBe(0);
    expect(notes).toEqual([{ kind: 'breaks', edit: settings.breaks![0], status: 'detached' }]);
  });
});

describe('edits made in the editor, after a save and a reopening', () => {
  const blocks: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'The door creaked. Nobody came.' }];

  it('are found in the stored scene and in the scene opened again, as they were made', () => {
    const document: DocumentScene = { sceneId: 'scene-1', sceneName: 'Scene', blocks };
    // The author made the edit on the editor's own conversion of the page.
    const made = addressSentences(documentSceneToTimelineWithOrigins(document).timeline).find((sentence) => sentence.text === 'Nobody came.')!;
    const settings: SceneComicSettings = { panels: [{ anchor: made.anchor, print: made.print, shot: 'close' }] };

    const saved = save(emptyScene(), blocks);
    const reopened = save(saved, sceneRecordToDocumentScene(saved).blocks);

    for (const scene of [saved, reopened]) {
      expect(resolveComicSettings(settings, addressSentences(scene.timeline)).notes).toEqual([]);
      expect(buildAuthorComicPlan(scene.timeline, settings).panels.map((panel) => panel.framing.shot)).toEqual(['wide', 'close']);
    }
  });
});

describe('an edit made in the Inspector', () => {
  const page: DocumentBlock[] = [{ id: 'doc_a', kind: 'text', content: 'The door creaked. Nobody came.' }];
  const sentences = addressSentences(documentSceneToTimelineWithOrigins({ sceneId: 'scene-1', sceneName: 'Scene', blocks: page }).timeline);
  const [first, second] = sentences;
  const target = (...of: typeof sentences) => of.map(({ anchor, text }) => ({ anchor, text }));

  it('is made on the first sentence of its panel or line, with its words', () => {
    const settings = withPanelEdit({ presentation: 'comic' }, sentences, target(first, second), { shot: 'close', size: 'half' });
    expect(settings).toEqual({ presentation: 'comic', panels: [{ anchor: first.anchor, print: first.print, shot: 'close', size: 'half' }] });
  });

  it('changes the edit acting on the panel, on whichever sentence it is, fastened where its words are now', () => {
    // Made on "Nobody came." while it was the first sentence; a sentence was written before it since.
    const moved = { anchor: 'doc_a/p0/s0', print: second.print, shot: 'close' as const };
    const settings = withPanelEdit({ panels: [moved] }, sentences, target(first, second), { shot: null, focus: { x: 0.2, y: 0.4 } });
    expect(settings).toEqual({ panels: [{ anchor: second.anchor, print: second.print, focus: { x: 0.2, y: 0.4 } }] });
  });

  it('puts a field back to automatic, and drops the edit when nothing is left of it', () => {
    const settings: SceneComicSettings = { panels: [{ anchor: first.anchor, print: first.print, shot: 'close' }] };
    expect(withPanelEdit(settings, sentences, target(first), { shot: null })).toEqual({});
  });

  it('gives a line its kind of words and its tail', () => {
    const settings = withElementEdit(undefined, sentences, target(second), { style: 'shout', tail: 'right' });
    expect(settings).toEqual({ elements: [{ anchor: second.anchor, print: second.print, style: 'shout', tail: 'right' }] });
    expect(withElementEdit(settings, sentences, target(second), { tail: 'auto' }))
      .toEqual({ elements: [{ anchor: second.anchor, print: second.print, style: 'shout' }] });
  });

  it('puts the automatic panel back: its panel and line edits go, where it begins and ends stays', () => {
    const breaks = [at(second.anchor, second.text)];
    const settings: SceneComicSettings = {
      breaks,
      panels: [{ anchor: first.anchor, print: first.print, shot: 'close' }],
      elements: [{ anchor: second.anchor, print: second.print, style: 'thought' }],
    };
    expect(withoutPanelEdits(settings, sentences, target(first, second))).toEqual({ breaks });
    const untouched: SceneComicSettings = { breaks };
    expect(withoutPanelEdits(untouched, sentences, target(first, second))).toBe(untouched);
  });

  it('is undone by putting the edits back as they were, keeping how the scene is read now', () => {
    const before: SceneComicSettings = { presentation: 'comic', panels: [{ anchor: first.anchor, print: first.print, size: 'half' }] };
    const after: SceneComicSettings = { presentation: 'novel', elements: [{ anchor: second.anchor, print: second.print, style: 'shout' }] };
    expect(withComicEdits(after, comicEditsOf(before))).toEqual({ presentation: 'novel', panels: before.panels });
  });
});

describe('edits kept through saves and Issues', () => {
  it('are fastened where their words are when the scene is saved, and left alone when nothing moved', () => {
    const saved = save(emptyScene(), [{ id: 'doc_a', kind: 'text', content: 'The door creaked. Nobody came.' }]);
    const nobody = addressSentences(saved.timeline).find((sentence) => sentence.text === 'Nobody came.')!;
    const comic: SceneComicSettings = { presentation: 'comic', panels: [{ anchor: nobody.anchor, print: nobody.print, shot: 'close' }] };

    // A sentence written before it moves it one place on.
    const edited = save(saved, [{ id: 'doc_a', kind: 'text', content: 'The door creaked. Wind. Nobody came.' }]);
    const moved = addressSentences(edited.timeline).find((sentence) => sentence.text === 'Nobody came.')!;
    expect(moved.anchor).not.toBe(nobody.anchor);
    const stored = withSavedComicSettings(edited, comic);
    expect(stored.comic).toEqual({ presentation: 'comic', panels: [{ anchor: moved.anchor, print: nobody.print, shot: 'close' }] });

    expect(withSavedComicSettings(stored, stored.comic)).toBe(stored);
  });

  it('are removed one at a time by kind and sentence', () => {
    const settings: SceneComicSettings = {
      presentation: 'comic',
      breaks: [at('b/p0/s1', 'Two.')],
      elements: [{ ...at('b/p0/s1', 'Two.'), style: 'shout' }],
    };
    expect(withoutComicEdit(settings, 'breaks', 'b/p0/s1')).toEqual({ presentation: 'comic', elements: settings.elements });
    expect(withoutComicEdit(settings, 'merges', 'b/p0/s1')).toBe(settings);
  });

  it('are fastened to another sentence with its words, an edit of the same kind there giving way', () => {
    const settings: SceneComicSettings = {
      panels: [{ ...at('b/p0/s0', 'One.'), shot: 'close' }, { ...at('b/p0/s2', 'Three.'), size: 'half' }],
    };
    expect(withComicEditFastened(settings, 'panels', 'b/p0/s0', { anchor: 'b/p0/s2', text: 'Three!' }))
      .toEqual({ panels: [{ anchor: 'b/p0/s2', print: sentencePrint('Three!'), shot: 'close' }] });
    expect(withComicEditFastened(settings, 'breaks', 'b/p0/s0', { anchor: 'b/p0/s2', text: 'Three.' })).toBe(settings);
  });

  it('are counted for the scene list and the reset', () => {
    expect(countComicEdits(undefined)).toBe(0);
    expect(countComicEdits({ presentation: 'comic', breaks: [at('b/p0/s1', 'Two.')], panels: [{ ...at('b/p0/s0', 'One.'), shot: 'close' }] })).toBe(2);
  });
});
