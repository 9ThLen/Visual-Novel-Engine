/**
 * A scene's page plan as the comic frame draws it: every picture made a URL the
 * frame can load, every speaker given a name, and how far the reader has got.
 *
 * The plan (comic-layout.ts) speaks of the story's own references — an asset
 * id, a character and a sprite id — which mean nothing inside the frame. The
 * host resolves them (asynchronously, per platform) and hands this module what
 * it found; a picture not resolved yet is drawn as nothing and filled in when
 * the strip is sent again.
 *
 * Plain TypeScript, no React and no store.
 */
import type { ComicPagePlan, ComicPanel } from '@/lib/comic/comic-layout';
import type {
  ComicFrameChoices,
  ComicFramePanel,
  ComicFrameStrip,
  ComicFrameWords,
} from '@/lib/comic/comic-frame-protocol';
import type { ComicPictureRole } from '@/lib/comic/comic-picture-size';

export interface ComicFrameAssets {
  /** A URL the frame can load for an asset reference, or null while it is not resolved. */
  imageUrl(assetRef: string): string | null;
  /** The asset reference of a character's sprite, as the novel finds it; null when there is none. */
  spriteRef(characterId: string, spriteId: string): string | null;
  /** A character's name, for a line written under none. */
  characterName(characterId: string): string | null;
}

/** A picture the plan shows: what to resolve, and the ways it is drawn, which decide the size of its copy. */
export interface ComicPlanPicture {
  ref: string;
  roles: ComicPictureRole[];
}

/** Every picture the plan's panels use, once each, with every way it is drawn. */
export function comicPlanPictures(plan: ComicPagePlan, assets: Pick<ComicFrameAssets, 'spriteRef'>): ComicPlanPicture[] {
  const roles = new Map<string, Set<ComicPictureRole>>();
  const add = (ref: string, role: ComicPictureRole) => {
    const known = roles.get(ref);
    if (known) known.add(role);
    else roles.set(ref, new Set([role]));
  };
  for (const panel of plan.panels) {
    if (panel.picture.backgroundAssetId) add(panel.picture.backgroundAssetId, 'background');
    for (const character of panel.picture.characters) {
      const ref = assets.spriteRef(character.characterId, character.spriteId);
      if (ref) add(ref, 'sprite');
    }
  }
  return [...roles].map(([ref, used]) => ({ ref, roles: [...used].sort() }));
}

function framePanel(panel: ComicPanel, assets: ComicFrameAssets): ComicFramePanel {
  const { picture, framing } = panel;
  const words: ComicFrameWords[] = [];
  for (const element of panel.elements) {
    if (!element.text.trim()) continue;
    // Only what the author changed travels: the frame draws each kind its own way otherwise.
    const tail = element.tail ? { tail: element.tail } : {};
    if (element.kind === 'caption') {
      const style = element.style && element.style !== 'caption' ? { style: element.style } : {};
      words.push({ id: element.id, kind: 'caption', text: element.text, ...style, ...tail });
      continue;
    }
    const speaker = element.speakerName?.trim() || assets.characterName(element.characterId)?.trim();
    const speakerX = picture.characters.find((character) => character.characterId === element.characterId)?.x;
    words.push({
      id: element.id,
      kind: 'bubble',
      text: element.text,
      ...(speaker ? { speaker } : {}),
      ...(speakerX === undefined ? {} : { speakerX }),
      ...(element.style !== 'speech' ? { style: element.style } : {}),
      ...tail,
    });
  }
  return {
    id: panel.id,
    background: picture.backgroundAssetId ? assets.imageUrl(picture.backgroundAssetId) : null,
    sprites: picture.characters.map((character) => {
      const ref = assets.spriteRef(character.characterId, character.spriteId);
      return { id: character.characterId, url: ref ? assets.imageUrl(ref) : null, x: character.x };
    }),
    ...(panel.size ? { size: panel.size } : {}),
    zoom: framing.zoom,
    focus: { x: framing.subject.x, y: framing.subject.y },
    place: { x: framing.placement.x, y: framing.placement.y },
    words,
  };
}

export interface ComicFrameStripOptions {
  /** How many panels the reader has opened; all of them when left out. */
  revealed?: number;
  choices?: ComicFrameChoices | null;
  /** Choices made earlier in the strip, by the id of the panel they come after. */
  panelChoices?: Readonly<Record<string, ComicFrameChoices>>;
  /** Panels may still come after the last one: the strip is being read. */
  more?: boolean;
}

export function comicFrameStrip(
  plan: ComicPagePlan,
  assets: ComicFrameAssets,
  options: ComicFrameStripOptions = {},
): ComicFrameStrip {
  const panels = plan.panels.map((panel) => {
    const drawn = framePanel(panel, assets);
    const made = options.panelChoices?.[panel.id];
    return made ? { ...drawn, choices: made } : drawn;
  });
  const revealed = Math.max(0, Math.min(panels.length, Math.floor(options.revealed ?? panels.length)));
  return { panels, revealed, choices: options.choices ?? null, ...(options.more ? { more: true } : {}) };
}
