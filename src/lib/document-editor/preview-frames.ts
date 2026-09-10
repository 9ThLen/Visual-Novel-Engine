/**
 * Turns a document scene into the sequence of frames a reader would step
 * through, so the inspector preview can scrub the whole scene instead of
 * showing only its opening moment.
 *
 * The walk runs over `documentSceneToTimeline()` output rather than over
 * document blocks directly: the timeline is what the reader actually executes,
 * so background changes and the implicit character show/hide steps generated
 * from dialogue lines are already resolved there.
 *
 * This is a deliberately partial executor. It resolves what is *visible*
 * (background, characters, text, choices) and ignores what is not (audio,
 * effects, camera, variables, conditions, goto jumps) — a preview frame is a
 * still, and branching on runtime variables has no answer at authoring time.
 */

import { documentSceneToTimeline } from '@/lib/document-editor/document-scene';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { Character, CharacterPosition } from '@/lib/character-types';
import type {
  BackgroundBlockData,
  CharacterBlockData,
  ChoiceBlockData,
  DialogueBlockData,
  TextBlockData,
  TimelineStep,
} from '@/lib/engine/types';

export interface PreviewFrameCharacter {
  characterId: string;
  /** Sprite URI as stored on the character library; still needs asset resolution. */
  spriteUri: string | null;
  position: CharacterPosition;
}

export interface PreviewFrameChoice {
  id: string;
  text: string;
  targetSceneId: string | null;
}

export type PreviewFrameKind = 'text' | 'dialogue' | 'choice';

export interface PreviewFrame {
  /** Stable within one build; used as a React key. */
  id: string;
  /** Zero-based position in the frame list. */
  index: number;
  kind: PreviewFrameKind;
  backgroundAssetId: string | null;
  /** Speaker nameplate text, or null for narration. */
  speaker: string | null;
  /** Character accent color for the nameplate, when the library defines one. */
  speakerColor?: string;
  text: string;
  choices: PreviewFrameChoice[];
  characters: PreviewFrameCharacter[];
}

const POSITIONS: readonly CharacterPosition[] = ['far-left', 'left', 'center', 'right', 'far-right'];

function sanitizePosition(input: unknown): CharacterPosition {
  return POSITIONS.includes(input as CharacterPosition) ? (input as CharacterPosition) : 'center';
}

/** Mirrors `resolveCharacterSpriteUri`, but against an already-scoped list. */
function spriteUriFor(characters: Character[], characterId: string, spriteId: string | null): string | null {
  const character = characters.find((item) => item.id === characterId);
  if (!character) return null;

  const candidates = [
    spriteId || undefined,
    character.authoring?.currentSpriteId,
    character.defaultSpriteId,
  ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

  for (const candidate of candidates) {
    const sprite = character.sprites.find((item) => item.id === candidate);
    if (sprite?.uri) return sprite.uri;
  }

  return null;
}

interface VisibleCharacter {
  spriteId: string | null;
  position: CharacterPosition;
}

/** Splits a text step the way the reader pages it — one frame per page. */
function textPages(content: string): string[] {
  const pages = content.split('\n\n').map((page) => page.trim()).filter(Boolean);
  return pages.length ? pages : [];
}

export function buildPreviewFrames(
  scene: DocumentScene | null,
  characters: Character[] = [],
): PreviewFrame[] {
  if (!scene) return [];

  const timeline = documentSceneToTimeline(scene, characters);
  const frames: PreviewFrame[] = [];

  let background: string | null = null;
  const visible = new Map<string, VisibleCharacter>();

  const snapshotCharacters = (): PreviewFrameCharacter[] =>
    Array.from(visible.entries()).map(([characterId, state]) => ({
      characterId,
      spriteUri: spriteUriFor(characters, characterId, state.spriteId),
      position: state.position,
    }));

  const push = (
    step: TimelineStep,
    pageIndex: number,
    partial: Pick<PreviewFrame, 'kind' | 'speaker' | 'text' | 'choices'> & { speakerColor?: string },
  ) => {
    frames.push({
      id: `${step.id}:${pageIndex}`,
      index: frames.length,
      backgroundAssetId: background,
      characters: snapshotCharacters(),
      ...partial,
    });
  };

  for (const step of timeline) {
    if (!step.enabled) continue;

    if (step.blockType === 'background') {
      const data = step.data as BackgroundBlockData;
      background = data.assetId ?? null;
      continue;
    }

    if (step.blockType === 'character') {
      const data = step.data as CharacterBlockData;
      if (!data.characterId) continue;

      if (data.action === 'hide') {
        visible.delete(data.characterId);
        continue;
      }

      const previous = visible.get(data.characterId);
      visible.set(data.characterId, {
        spriteId: data.spriteId || previous?.spriteId || null,
        position: sanitizePosition(data.position ?? previous?.position),
      });
      continue;
    }

    if (step.blockType === 'text') {
      const data = step.data as TextBlockData;
      textPages(data.content ?? '').forEach((page, pageIndex) => {
        push(step, pageIndex, { kind: 'text', speaker: null, text: page, choices: [] });
      });
      continue;
    }

    if (step.blockType === 'dialogue') {
      const data = step.data as DialogueBlockData;
      data.entries.forEach((entry, entryIndex) => {
        if (!entry.text.trim()) return;
        const character = characters.find((item) => item.id === entry.characterId);
        push(step, entryIndex, {
          kind: 'dialogue',
          speaker: entry.speakerName || character?.name || null,
          speakerColor: character?.color,
          text: entry.text,
          choices: [],
        });
      });
      continue;
    }

    if (step.blockType === 'choice') {
      const data = step.data as ChoiceBlockData;
      const previous = frames[frames.length - 1];
      push(step, 0, {
        kind: 'choice',
        // The reader keeps the last line on screen and stacks the options under
        // it, so the choice frame inherits whatever text was showing.
        speaker: previous?.speaker ?? null,
        speakerColor: previous?.speakerColor,
        text: previous?.text ?? '',
        choices: data.options.map((option) => ({
          id: option.id,
          text: option.text,
          targetSceneId: option.targetSceneId ?? null,
        })),
      });
    }
  }

  return frames;
}

/**
 * Words and estimated reading time for the scene's readable frames.
 * 180 wpm is a conservative silent-reading pace for narrative prose.
 */
export function getSceneReadingStats(frames: PreviewFrame[]): {
  words: number;
  seconds: number;
  lines: number;
} {
  let words = 0;
  let lines = 0;

  for (const frame of frames) {
    // Choice frames inherit the previous line's text; counting them would
    // double every word that precedes a choice.
    if (frame.kind === 'choice' || !frame.text.trim()) continue;
    lines += 1;
    words += frame.text.trim().split(/\s+/).length;
  }

  return { words, seconds: Math.round((words / 180) * 60), lines };
}
