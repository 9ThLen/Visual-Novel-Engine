import type { BridgeImagePlacement } from '@/lib/bridge-protocol';
import type { TimelineStep } from '@/lib/engine/types';
import { useAppStore } from '@/stores/use-app-store';
import { applyAiScenePatchToStore } from './scene-patch-adapter';
import { computeSceneRevision } from './scene-revision';
import { applyAiChangeSetToStore } from './change-set-adapter';
import { computeCharacterLibraryRevision } from './change-set';

export type ApplyImagePlacementResult =
  | { ok: true; placed: false }
  | { ok: true; placed: true; stepId?: string; alreadyApplied: boolean }
  | { ok: false; error: string };

function backgroundStep(
  id: string,
  assetId: string,
  placement: Extract<BridgeImagePlacement, { kind: 'scene_background' }>,
): TimelineStep {
  return {
    id,
    blockType: 'background',
    data: {
      assetId,
      transition: placement.transition ?? 'fade',
      duration: placement.duration ?? 0.5,
      delay: 0,
    },
    collapsed: false,
    enabled: true,
  };
}

export async function applyImportedImagePlacement(
  storyId: string,
  requestId: string,
  assetId: string,
  placement?: BridgeImagePlacement,
): Promise<ApplyImagePlacementResult> {
  if (!placement) return { ok: true, placed: false };
  if (placement.kind === 'character_sprite') {
    const state = useAppStore.getState();
    const characters = state.characterLibraries[storyId] ?? [];
    const character = characters.find((item) => item.id === placement.characterId);
    if (!character) return { ok: false, error: `Character '${placement.characterId}' not found` };
    const existingSprite = character.sprites.find((sprite) => sprite.uri === assetId || sprite.assetUri === assetId);
    const scenePlacement = placement.scenePlacement;
    if (existingSprite && !scenePlacement) return { ok: true, placed: true, alreadyApplied: true };
    const scene = scenePlacement ? state.sceneRecordsByStory[storyId]?.[scenePlacement.sceneId] : undefined;
    if (scenePlacement && !scene) return { ok: false, error: `Scene '${scenePlacement.sceneId}' not found` };
    const tempSpriteId = `newsprite:${requestId}`;
    const spriteId = existingSprite?.id ?? tempSpriteId;
    const stepId = scenePlacement?.operation === 'replace' ? scenePlacement.stepId! : `ai-character-${requestId}`;
    const existingStep = scene?.timeline.find((step) => step.id === stepId);
    if (existingStep) {
      const data = existingStep.data as {
        characterId?: string; spriteId?: string; position?: string; transition?: string; duration?: number | null; delay?: number;
      };
      if (existingStep.blockType === 'character'
        && data.characterId === character.id
        && data.spriteId === spriteId
        && data.position === (scenePlacement?.position ?? 'center')
        && data.transition === (scenePlacement?.transition ?? 'fade')
        && data.duration === (scenePlacement?.duration ?? null)
        && data.delay === 0) {
        return { ok: true, placed: true, stepId, alreadyApplied: true };
      }
      if (scenePlacement?.operation === 'insert') return { ok: false, error: `Step '${stepId}' already exists` };
    }
    const items: import('./change-set').AiChangeSet['items'] = existingSprite ? [] : [{
      kind: 'add_character_sprite',
      addition: {
        characterId: character.id,
        assetId,
        sprite: { tempId: tempSpriteId, name: placement.spriteName, tags: placement.tags, setAsDefault: placement.setAsDefault },
      },
    }];
    if (scenePlacement && scene) {
      const step: TimelineStep = {
        id: stepId,
        blockType: 'character',
        data: {
          characterId: character.id,
          spriteId,
          position: scenePlacement.position ?? 'center',
          transition: scenePlacement.transition ?? 'fade',
          delay: 0,
          duration: scenePlacement.duration ?? null,
        },
        collapsed: false,
        enabled: true,
      };
      items.push({
        kind: 'patch_scene',
        sceneRef: scene.id,
        operations: scenePlacement.operation === 'replace'
          ? [{ op: 'replace_step', stepId, step }]
          : [{ op: 'insert_steps', afterStepId: scenePlacement.afterStepId ?? null, steps: [step] }],
      });
    }
    const applied = await applyAiChangeSetToStore({
      storyId,
      expectedSceneRevisions: scene ? { [scene.id]: computeSceneRevision(scene) } : {},
      expectedCharacterRevision: computeCharacterLibraryRevision(characters),
      items,
      explanation: `Add generated sprite to ${character.name}`,
    });
    return applied.ok
      ? { ok: true, placed: true, ...(scenePlacement ? { stepId } : {}), alreadyApplied: false }
      : { ok: false, error: applied.message };
  }
  const state = useAppStore.getState();
  const scene = state.sceneRecordsByStory[storyId]?.[placement.sceneId];
  if (!scene) return { ok: false, error: `Scene '${placement.sceneId}' not found` };

  const stepId = placement.operation === 'replace' ? placement.stepId! : `ai-image-${requestId}`;
  const existing = scene.timeline.find((step) => step.id === stepId);
  if (existing) {
    if (existing.blockType === 'background' && (existing.data as { assetId?: string | null }).assetId === assetId) {
      return { ok: true, placed: true, stepId, alreadyApplied: true };
    }
    if (placement.operation === 'insert') return { ok: false, error: `Step '${stepId}' already exists` };
  }

  const patch = {
    storyId: scene.storyId,
    sceneId: scene.id,
    expectedRevision: computeSceneRevision(scene),
    explanation: placement.operation === 'replace' ? 'Replace scene background with generated image' : 'Add generated scene background',
    operations: placement.operation === 'replace'
      ? [{ op: 'replace_step' as const, stepId, step: backgroundStep(stepId, assetId, placement) }]
      : [{ op: 'insert_steps' as const, afterStepId: placement.afterStepId ?? null, steps: [backgroundStep(stepId, assetId, placement)] }],
  };
  const result = await applyAiScenePatchToStore(patch);
  return result.ok
    ? { ok: true, placed: true, stepId, alreadyApplied: false }
    : { ok: false, error: result.errors.join('; ') };
}
