import { collectAssetReferences, type AssetUsageKind } from '@/lib/asset-usage';
import { isPortableAssetUri } from '@/lib/backup-service';
import type { InteractiveObjectBlockData, SceneRecord } from '@/lib/engine/types';
import { generateAssetId } from '@/lib/id-utils';
import type { LibraryAsset } from '@/lib/media-library-service';
import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  loadSceneRecordsForStory,
  type SceneRecordStorageLike,
} from '@/lib/scene-record-storage';
import { sha256Source } from '@/lib/story-backup/hash';
import { resolveStoryBackupSource } from '@/lib/story-backup/media-source';
import {
  STORY_BACKUP_LIMITS,
  type PreparedStoryBackupAsset,
  type StoryArchivePayloadV1,
} from '@/lib/story-backup/types';
import { useAppStore } from '@/stores/use-app-store';

type AssetKind = 'image' | 'audio' | 'other';

interface PendingAsset {
  asset?: LibraryAsset;
  assetId: string;
  uri: string;
  kind: AssetKind;
  references: Set<string>;
}

export interface CapturedStoryBackup {
  story: ReturnType<typeof useAppStore.getState>['storiesMetadata'][number];
  payload: StoryArchivePayloadV1;
  assets: PreparedStoryBackupAsset[];
}

function usageKindToAssetKind(kind: AssetUsageKind): AssetKind {
  return kind === 'music' || kind === 'sound' ? 'audio' : 'image';
}

function extensionFromName(name: string): string | undefined {
  const match = /(?:^|\/)([^/]+)(\.[^.\/]+)$/.exec(name);
  return match?.[2]?.toLowerCase();
}

function filenameFromUri(uri: string): string {
  const clean = uri.split(/[?#]/, 1)[0];
  const last = clean.split('/').pop();
  if (!last || last.length > 255) return 'asset.bin';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function isReadableReference(reference: string): boolean {
  return /^(assets\/|bundle:|file:|content:|data:|blob:|idb:|https?:)/i.test(reference)
    || reference.startsWith('/');
}

function collectInteractiveUris(scenes: SceneRecord[]): { reference: string; kind: AssetKind }[] {
  return scenes.flatMap((scene) => scene.timeline.flatMap((step) => {
    if (step.blockType !== 'interactive_object') return [];
    const data = step.data as InteractiveObjectBlockData;
    return (data.actions ?? []).flatMap<{ reference: string; kind: AssetKind }>((action) => {
      if (action.type === 'play_audio') return [{ reference: action.audioUri, kind: 'audio' as const }];
      if (action.type === 'show_image') return [{ reference: action.imageUri, kind: 'image' as const }];
      return [];
    });
  }));
}

export async function captureStoryBackup(
  storyId: string,
  storage: SceneRecordStorageLike = createPersistentStorage() as SceneRecordStorageLike,
): Promise<CapturedStoryBackup> {
  const state = useAppStore.getState();
  const story = state.storiesMetadata.find((candidate) => candidate.id === storyId);
  if (!story) throw new Error(`Unknown story: ${storyId}`);

  const sceneMap = state.sceneRecordHydration[storyId] === 'full'
    ? state.sceneRecordsByStory[storyId] ?? {}
    : await loadSceneRecordsForStory(storage, storyId);
  const scenes = Object.values(sceneMap);
  if (!scenes.length) throw new Error(`Story has no persisted scenes: ${storyId}`);
  const characters = structuredClone(state.characterLibraries[storyId] ?? []);
  const audioLibrary = structuredClone(state.audioLibraries[storyId] ?? []);
  const assetsById = new Map(state.mediaLibrary.map((asset) => [asset.id, asset]));
  const assetsByReference = new Map<string, LibraryAsset>();
  state.mediaLibrary.forEach((asset) => {
    assetsByReference.set(asset.id, asset);
    if (!assetsByReference.has(asset.uri)) assetsByReference.set(asset.uri, asset);
  });

  const pending = new Map<string, PendingAsset>();
  const missing = new Set<string>();
  const addReference = (reference: string | null | undefined, kind: AssetKind, required = true) => {
    if (!reference) return;
    const asset = assetsByReference.get(reference);
    if (asset) {
      const existing = pending.get(asset.id) ?? {
        asset,
        assetId: asset.id,
        uri: asset.uri,
        kind: asset.type,
        references: new Set<string>(),
      };
      existing.references.add(asset.id);
      if (assetsByReference.get(asset.uri)?.id === asset.id) existing.references.add(asset.uri);
      existing.references.add(reference);
      pending.set(asset.id, existing);
      return;
    }
    if (!isReadableReference(reference)) {
      if (required) missing.add(reference);
      return;
    }
    const key = `uri:${reference}`;
    const existing = pending.get(key) ?? {
      assetId: generateAssetId(),
      uri: reference,
      kind,
      references: new Set<string>(),
    };
    existing.references.add(reference);
    pending.set(key, existing);
  };

  for (const assetId of state.mediaAssetIdsByStory[storyId] ?? []) {
    if (assetsById.has(assetId)) addReference(assetId, 'other', false);
  }
  for (const reference of collectAssetReferences(scenes)) {
    if (reference.kind !== 'sprite') addReference(reference.assetId, usageKindToAssetKind(reference.kind));
  }
  scenes.forEach((scene) => {
    addReference(scene.sceneState.backgroundAssetId, 'image');
    addReference(scene.sceneState.musicTrackId, 'audio');
    scene.sceneState.soundEvents?.forEach((event) => addReference(event.assetId, 'audio'));
    scene.sceneState.interactiveObjects?.forEach((object) => {
      addReference(object.imageUri, 'image');
      object.actions.forEach((action) => {
        if (action.type === 'play_audio') addReference(action.audioUri, 'audio');
        if (action.type === 'show_image') addReference(action.imageUri, 'image');
      });
    });
  });
  characters.forEach((character) => character.sprites.forEach((sprite) => {
    addReference(sprite.assetUri ?? sprite.uri, 'image');
  }));
  audioLibrary.forEach((item) => {
    const matched = assetsByReference.get(item.id) ?? assetsByReference.get(item.uri);
    addReference(matched?.id ?? item.uri, 'audio');
  });
  addReference(story.thumbnailUri, 'image');
  scenes.forEach((scene) => addReference(scene.voiceAudioUri, 'audio'));
  collectInteractiveUris(scenes).forEach(({ reference, kind }) => addReference(reference, kind));

  const audioIds = new Set(audioLibrary.map((item) => item.id));
  scenes.forEach((scene) => scene.audioTriggers?.forEach((trigger) => {
    if (!audioIds.has(trigger.audioId)) missing.add(`audio:${trigger.audioId}`);
  }));
  if (missing.size) {
    throw new Error(`Story backup is missing media references: ${Array.from(missing).join(', ')}`);
  }

  const preparedAssets: PreparedStoryBackupAsset[] = [];
  const failures: string[] = [];
  for (const item of pending.values()) {
    try {
      const resolved = await resolveStoryBackupSource(item.uri);
      if (resolved.size > STORY_BACKUP_LIMITS.maxObjectBytes) {
        throw new Error(`exceeds ${STORY_BACKUP_LIMITS.maxObjectBytes} bytes`);
      }
      const digest = await sha256Source(resolved.source, STORY_BACKUP_LIMITS.maxObjectBytes);
      const name = item.asset?.name || filenameFromUri(item.uri);
      const mimeType = item.asset?.mimeType || resolved.mimeType || 'application/octet-stream';
      const kind = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : item.kind;
      preparedAssets.push({
        metadata: {
          assetId: item.assetId,
          sourceReferences: Array.from(item.references),
          sha256: digest.sha256,
          size: digest.size,
          kind,
          mimeType,
          originalName: name,
          originalExtension: extensionFromName(name),
          archivePath: `objects/${digest.sha256}`,
        },
        source: resolved.source,
      });
    } catch (error) {
      // Bundled app assets are restored by the application itself. Some legacy
      // demo scenes reference bundled files that no longer ship; preserve those
      // references in story.json without blocking backup of the user's data.
      if (!item.asset && isPortableAssetUri(item.uri)) continue;
      failures.push(`${item.asset?.name || item.uri}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(`Story backup cannot read media:\n${failures.join('\n')}`);

  return {
    story: structuredClone(story),
    payload: {
      scenes: structuredClone(sceneMap),
      characters,
      audioLibrary,
      mediaMembershipIds: preparedAssets.map((asset) => asset.metadata.assetId),
    },
    assets: preparedAssets,
  };
}
