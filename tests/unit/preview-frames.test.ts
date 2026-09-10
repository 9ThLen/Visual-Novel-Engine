import { buildPreviewFrames, getSceneReadingStats } from '@/lib/document-editor/preview-frames';
import type { DocumentBlock, DocumentScene } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type { BackgroundBlockData, TimelineStep } from '@/lib/engine/types';

function scene(blocks: DocumentBlock[]): DocumentScene {
  return { sceneId: 'scene_1', sceneName: 'Scene 1', blocks };
}

function text(id: string, content: string): DocumentBlock {
  return { id, kind: 'text', content };
}

function dialogue(id: string, speakerName: string, body: string, characterId: string | null = null): DocumentBlock {
  return {
    id,
    kind: 'dialogue',
    speakerName,
    characterId,
    spriteId: null,
    text: body,
  };
}

function backgroundBlock(id: string, assetId: string | null): DocumentBlock {
  const step: TimelineStep = {
    id: `${id}_step`,
    blockType: 'background',
    enabled: true,
    data: { assetId, transition: 'fade', duration: 500 } satisfies BackgroundBlockData,
  } as TimelineStep;

  return {
    id,
    kind: 'technical',
    commandId: 'background',
    blockType: 'background',
    label: 'Background',
    summary: assetId ?? 'none',
    step,
    sourceStep: step,
  };
}

function choice(id: string, options: { id: string; text: string; targetSceneId: string | null }[]): DocumentBlock {
  return { id, kind: 'choice', question: 'Що зробити?', options };
}

const characters: Character[] = [
  {
    id: 'char_a',
    name: 'Аліса',
    color: '#ff0000',
    sprites: [{ id: 'sprite_1', name: 'Neutral', uri: 'asset_sprite_1', createdAt: 0 }],
    defaultSpriteId: 'sprite_1',
    createdAt: 0,
  },
];

describe('buildPreviewFrames', () => {
  it('returns nothing for a missing or empty scene', () => {
    expect(buildPreviewFrames(null)).toEqual([]);
    expect(buildPreviewFrames(scene([]))).toEqual([]);
  });

  it('ignores the trailing empty text block the editor always appends', () => {
    const frames = buildPreviewFrames(scene([text('t1', 'Перший рядок.'), text('t2', '')]));
    expect(frames).toHaveLength(1);
    expect(frames[0].text).toBe('Перший рядок.');
  });

  it('splits a text block into one frame per page, the way the reader pages it', () => {
    const frames = buildPreviewFrames(scene([text('t1', 'Перша сторінка.\n\nДруга сторінка.')]));
    expect(frames.map((frame) => frame.text)).toEqual(['Перша сторінка.', 'Друга сторінка.']);
    expect(frames.map((frame) => frame.index)).toEqual([0, 1]);
  });

  it('carries the background forward and switches it mid-scene', () => {
    const frames = buildPreviewFrames(
      scene([
        backgroundBlock('b1', 'asset_day'),
        text('t1', 'День.'),
        backgroundBlock('b2', 'asset_night'),
        text('t2', 'Ніч.'),
      ]),
    );

    expect(frames.map((frame) => frame.backgroundAssetId)).toEqual(['asset_day', 'asset_night']);
  });

  it('leaves the background null until one is set', () => {
    const frames = buildPreviewFrames(scene([text('t1', 'Без фону.')]));
    expect(frames[0].backgroundAssetId).toBeNull();
  });

  it('names the speaker and resolves the sprite of a dialogue line', () => {
    const frames = buildPreviewFrames(scene([dialogue('d1', 'Аліса', 'Привіт.', 'char_a')]), characters);

    expect(frames).toHaveLength(1);
    expect(frames[0].kind).toBe('dialogue');
    expect(frames[0].speaker).toBe('Аліса');
    expect(frames[0].speakerColor).toBe('#ff0000');
    expect(frames[0].characters).toEqual([
      { characterId: 'char_a', spriteUri: 'asset_sprite_1', position: 'center' },
    ]);
  });

  it('renders narration without a speaker', () => {
    const frames = buildPreviewFrames(scene([text('t1', 'Йшов дощ.')]));
    expect(frames[0].kind).toBe('text');
    expect(frames[0].speaker).toBeNull();
  });

  it('keeps the previous line on the choice frame and lists the options', () => {
    const frames = buildPreviewFrames(
      scene([
        text('t1', 'Двері зачинені.'),
        choice('c1', [
          { id: 'o1', text: 'Постукати', targetSceneId: 'scene_2' },
          { id: 'o2', text: 'Піти геть', targetSceneId: null },
        ]),
      ]),
    );

    expect(frames).toHaveLength(2);
    const choiceFrame = frames[1];
    expect(choiceFrame.kind).toBe('choice');
    expect(choiceFrame.text).toBe('Двері зачинені.');
    expect(choiceFrame.choices.map((option) => option.text)).toEqual(['Постукати', 'Піти геть']);
    expect(choiceFrame.choices[1].targetSceneId).toBeNull();
  });

  it('gives every frame a distinct key', () => {
    const frames = buildPreviewFrames(
      scene([text('t1', 'Одна.\n\nДва.'), dialogue('d1', 'Аліса', 'Три.', 'char_a')]),
      characters,
    );
    expect(new Set(frames.map((frame) => frame.id)).size).toBe(frames.length);
  });
});

describe('getSceneReadingStats', () => {
  it('counts words and estimates time at 180 wpm', () => {
    const frames = buildPreviewFrames(scene([text('t1', 'один два три чотири пʼять шість')]));
    const stats = getSceneReadingStats(frames);

    expect(stats.words).toBe(6);
    expect(stats.lines).toBe(1);
    expect(stats.seconds).toBe(2);
  });

  it('does not double-count the text a choice frame inherits', () => {
    const withoutChoice = getSceneReadingStats(buildPreviewFrames(scene([text('t1', 'один два три')])));
    const withChoice = getSceneReadingStats(
      buildPreviewFrames(
        scene([text('t1', 'один два три'), choice('c1', [{ id: 'o1', text: 'Далі', targetSceneId: null }])]),
      ),
    );

    expect(withChoice.words).toBe(withoutChoice.words);
    expect(withChoice.lines).toBe(withoutChoice.lines);
  });

  it('reports zero for an empty scene', () => {
    expect(getSceneReadingStats([])).toEqual({ words: 0, seconds: 0, lines: 0 });
  });
});
