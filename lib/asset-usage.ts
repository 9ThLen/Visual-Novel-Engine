import type {
  BackgroundBlockData,
  CharacterBlockData,
  InteractiveObjectBlockData,
  MusicBlockData,
  SceneRecord,
  SoundBlockData,
} from '@/lib/engine/types';

export type AssetUsageKind = 'background' | 'sprite' | 'music' | 'sound' | 'object';

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
