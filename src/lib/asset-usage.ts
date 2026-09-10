import type {
  BackgroundBlockData,
  CharacterBlockData,
  DialogueBlockData,
  InteractiveObjectBlockData,
  MusicBlockData,
  SceneRecord,
  SoundBlockData,
  VideoBlockData,
} from '@/lib/engine/types';
import { normalizeVideoData } from '@/lib/engine/video-utils';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import type { LibraryAsset } from '@/lib/media-library-service';

export type AssetUsageKind = 'background' | 'sprite' | 'music' | 'sound' | 'object' | 'video';

export interface AssetReference {
  assetId: string;
  kind: AssetUsageKind;
  sceneId: string;
  stepId: string;
  enabled: boolean;
}

export interface AvailableAsset {
  id: string;
  kind: AssetUsageKind;
  name: string;
  aliases?: string[];
}

export interface AssetUsage {
  asset: AvailableAsset;
  references: AssetReference[];
}

export interface AssetUsageReport {
  references: AssetReference[];
  assets: AssetUsage[];
  unusedAssets: AvailableAsset[];
  brokenReferences: AssetReference[];
}

export function toSpriteUsageAssetId(characterId: string, spriteId: string): string {
  return `${characterId}:${spriteId}`;
}

export function buildAvailableAssets(
  imageAssets: LibraryAsset[],
  audioLibrary: AudioLibraryItem[],
  characters: Character[],
): AvailableAsset[] {
  return [
    ...imageAssets.map((asset) => ({
      id: asset.id,
      // Video is its own kind: an image must never satisfy a video reference,
      // or a mistyped assetId would look healthy.
      kind: (asset.type === 'video' ? 'video' : 'background') as AssetUsageKind,
      name: asset.name,
      aliases: [asset.uri],
    })),
    ...audioLibrary.map((asset) => ({
      id: asset.id,
      kind: asset.type === 'music' ? 'music' as const : 'sound' as const,
      name: asset.name,
      aliases: [asset.uri],
    })),
    ...characters.flatMap((character) => character.sprites.map((sprite) => ({
      id: toSpriteUsageAssetId(character.id, sprite.id),
      kind: 'sprite' as const,
      name: `${character.name} / ${sprite.name}`,
      // `assetUri` holds the persistent URI whenever `uri` carries a runtime
      // blob; the membership migration already checks both, so usage has to
      // use the same notion of identity or the two disagree.
      aliases: sprite.assetUri ? [sprite.id, sprite.uri, sprite.assetUri] : [sprite.id, sprite.uri],
    }))),
  ];
}

function cleanId(value: string | null | undefined): string | null {
  const id = value?.trim();
  return id ? id : null;
}

function makeReference(
  assetId: string | null | undefined,
  kind: AssetUsageKind,
  sceneId: string,
  stepId: string,
  enabled: boolean,
): AssetReference | null {
  const cleaned = cleanId(assetId);
  if (!cleaned) return null;
  return { assetId: cleaned, kind, sceneId, stepId, enabled };
}

export function collectAssetReferences(scenes: SceneRecord[]): AssetReference[] {
  const references: AssetReference[] = [];

  for (const scene of scenes) {
    for (const step of scene.timeline ?? []) {
      const enabled = step.enabled !== false;
      let reference: AssetReference | null = null;
      // A video step can point at two assets, so it pushes its own references
      // instead of going through the single-reference path below.
      if (step.blockType === 'video') {
        const data = normalizeVideoData(step.data as VideoBlockData);
        if (data.mode === 'play') {
          const clip = makeReference(data.assetId, 'video', scene.id, step.id, enabled);
          if (clip) references.push(clip);
          // The poster is a still frame, so it lives in the image library and
          // has to be counted as used there — otherwise it reads as orphaned
          // and never reaches the backup.
          const poster = makeReference(data.posterAssetId, 'background', scene.id, step.id, enabled);
          if (poster) references.push(poster);
        }
        continue;
      }

      // Every dialogue entry pins a sprite of its own, and those pins are the
      // only reference some sprites have: the document->record conversion emits
      // a character step only when the sprite CHANGES, and timelines written by
      // an AI change set or a backup import may carry no character step at all.
      if (step.blockType === 'dialogue') {
        const seen = new Set<string>();
        for (const entry of (step.data as DialogueBlockData).entries ?? []) {
          const characterId = cleanId(entry.characterId);
          const spriteId = cleanId(entry.spriteId);
          if (!characterId || !spriteId) continue;
          const usageAssetId = toSpriteUsageAssetId(characterId, spriteId);
          // One reference per step per sprite: a twenty-line block that never
          // changes sprite uses it once, not twenty times.
          if (seen.has(usageAssetId)) continue;
          seen.add(usageAssetId);
          const pin = makeReference(usageAssetId, 'sprite', scene.id, step.id, enabled);
          if (pin) references.push(pin);
        }
        continue;
      }

      switch (step.blockType) {
        case 'background':
          reference = makeReference(
            (step.data as BackgroundBlockData).assetId,
            'background',
            scene.id,
            step.id,
            enabled,
          );
          break;
        case 'character': {
          const data = step.data as CharacterBlockData;
          const characterId = cleanId(data.characterId);
          const spriteId = cleanId(data.spriteId);
          reference = characterId && spriteId
            ? makeReference(toSpriteUsageAssetId(characterId, spriteId), 'sprite', scene.id, step.id, enabled)
            : null;
          break;
        }
        case 'music': {
          const data = step.data as MusicBlockData;
          reference = data.mode === 'track'
            ? makeReference(data.assetId, 'music', scene.id, step.id, enabled)
            : null;
          break;
        }
        case 'sound': {
          const data = step.data as SoundBlockData;
          reference = data.mode === 'track'
            ? makeReference(data.assetId, 'sound', scene.id, step.id, enabled)
            : null;
          break;
        }
        case 'interactive_object':
          reference = makeReference(
            (step.data as InteractiveObjectBlockData).assetId,
            'object',
            scene.id,
            step.id,
            enabled,
          );
          break;
      }

      if (reference) references.push(reference);
    }
  }

  return references;
}

function canUseAssetKind(assetKind: AssetUsageKind, referenceKind: AssetUsageKind): boolean {
  if (assetKind === referenceKind) return true;
  if ((assetKind === 'background' || assetKind === 'object')
    && (referenceKind === 'background' || referenceKind === 'object')) {
    return true;
  }
  if ((assetKind === 'music' || assetKind === 'sound')
    && (referenceKind === 'music' || referenceKind === 'sound')) {
    return true;
  }
  return false;
}

function assetMatchesReference(asset: AvailableAsset, reference: AssetReference): boolean {
  if (!canUseAssetKind(asset.kind, reference.kind)) return false;
  if (asset.id === reference.assetId) return true;
  return asset.aliases?.includes(reference.assetId) ?? false;
}

export function buildAssetUsageReport(
  references: AssetReference[],
  availableAssets: AvailableAsset[],
): AssetUsageReport {
  const assets = availableAssets.map<AssetUsage>((asset) => ({ asset, references: [] }));
  const brokenReferences: AssetReference[] = [];

  for (const reference of references) {
    const usage = assets.find((item) => assetMatchesReference(item.asset, reference));
    if (usage) usage.references.push(reference);
    else brokenReferences.push(reference);
  }

  return {
    references,
    assets,
    unusedAssets: assets.filter((item) => item.references.length === 0).map((item) => item.asset),
    brokenReferences,
  };
}
