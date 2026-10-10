/**
 * What the app does when the bridge calls one of its tools.
 *
 * The chat panel used to hold this chain inside the effect that owns the
 * socket. It is the app's whole answer to the assistant — read the story, read
 * the editor, put a proposal in front of the author — and none of it needs a
 * panel to be on screen. Whoever holds the session supplies the few things that
 * do belong to it: where the author is, how a card is shown and decided, and
 * the queue and barrier every change goes through.
 */
import { removeImageBackground } from '@/lib/remove-background';
import type { ToolResult } from '@/lib/bridge-client';
import { useAppStore } from '@/stores/use-app-store';
import type { AiChatPendingCapability, AiChatPendingChangeSet } from '@/stores/ai-chat-store';
import { describeAiAppearancePatch, validateAiAppearancePatch, type AiReaderAppearancePatch, type AppearancePatchDescription } from './appearance-patch';
import { applyAiAppearancePatchToStore } from './appearance-patch-adapter';
import { findAssetUsage, getImageDetails, listStoryImages } from './asset-tools';
import { APP_BRIDGE_TOOL_NAMES } from './bridge-tools';
import {
  aiChangeSetSchema,
  describeAiChangeSet,
  validateAiChangeSet,
  type AiChangeSet,
  type AiChangeSetErrorCode,
  type AiChangeSetState,
} from './change-set';
import type { AiEditorContext } from './editor-context';
import type { CaptureEditorContext, EditorContextCapture } from './editor-context-capture';
import { executeRemoveBackground, getStoryImageBinary, type AiImageResult } from './image-tools';
import { AI_CAPABILITIES, normalizeAiPermissions, resolveCapability, resolveEffectiveCapability, type AiCapability, type AiPermissions } from './permissions';
import { buildAiChangeSetState, buildPatchProjectContext } from './project-context';
import { describeAiScenePatch, validateAiScenePatch, type ScenePatchDescription } from './scene-patch';
import { applyAiScenePatchToStore } from './scene-patch-adapter';
import type { AiScenePatch } from './scene-patch-types';
import { computeSceneRevision } from './scene-revision';
import { buildAiStoryContext } from './story-context';
import { isWriteRefusal, type WriteGate } from './write-gate';

export interface AppToolCallContext {
  untrustedAttachmentMode: boolean;
  /** Comes with a call that waits for the author: how long its card may stay up. */
  ttlMs?: number;
}

export interface AppToolExecutorDeps {
  storyId: string;
  /** The scene in view, for a call that names none. */
  getActiveSceneId: () => string | null;
  /** Absent where no editor is open. */
  getCaptureEditorContext: () => CaptureEditorContext | undefined;
  buildEditorContext: (capture: EditorContextCapture, kind: AiEditorContext['kind']) => AiEditorContext;
  /** The context that went out with the message of the turn in progress. */
  getTurnEditorContext: () => AiEditorContext | null;
  dropTurnEditorContext: () => void;
  /** Starts tracking a call the bridge may withdraw; `card` says it is the one on screen. */
  beginInteraction: (toolCallId: string, ttlMs: number | undefined, untrusted: boolean, card: boolean) => void;
  settleInteraction: (toolCallId: string) => void;
  /** Ask for it before the first wait: a gate belongs to the session it was made in. */
  writeGate: (toolCallId: string | null, capability: AiCapability) => WriteGate;
  showScenePatch: (pending: { patch: AiScenePatch; description: ScenePatchDescription }) => void;
  showAppearancePatch: (pending: { patch: AiReaderAppearancePatch; description: AppearancePatchDescription }) => void;
  showChangeSet: (pending: AiChatPendingChangeSet) => void;
  showCapability: (pending: AiChatPendingCapability) => void;
  /** Resolves with what the author decides about the card that is up. */
  waitForDecision: () => Promise<unknown>;
  /** Runs one change at a time: tool calls arrive without waiting for each other. */
  enqueueMutation: <T>(task: () => Promise<T>) => Promise<T>;
  /** Lands the open document's draft in the store; false means nothing may be written on top. */
  passesSaveBarrier: () => Promise<boolean>;
  /** Keeps an image the app produced itself and offers it for import. */
  keepImageResult: (result: AiImageResult) => Promise<void>;
}

export type AppToolExecutor = (toolCallId: string, name: string, input: unknown, toolContext?: AppToolCallContext) => Promise<ToolResult>;

function buildChangeSetState(storyId: string): AiChangeSetState {
  return buildAiChangeSetState(storyId);
}

function mapChangeSetError(code: AiChangeSetErrorCode, message: string) {
  return code === 'STALE_REVISION'
    ? { ok: false as const, errorCode: 'STALE_REVISION' as const, errorMessage: message }
    : { ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: message, details: { reason: code } };
}

/** The reason a refused change is reported under: the bridge reads `expired` and `cancelled` as statuses. */
export function refusalReason(code: string): string {
  return code === 'EXPIRED' ? 'expired' : code === 'CANCELLED' || code === 'SESSION_ENDED' ? 'cancelled' : code;
}

export function executeProposeChangeSet(
  storyId: string,
  input: unknown,
  setPending: (pending: AiChatPendingChangeSet) => void,
  waitForDecision: () => Promise<unknown>,
) {
  const parsed = aiChangeSetSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve({ ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: parsed.error.issues.map(issue => issue.message).join('; '), details: { reason: 'VALIDATION_FAILED' } });
  }
  const changeSet: AiChangeSet = parsed.data;
  if (changeSet.storyId !== storyId) {
    return Promise.resolve({ ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: 'Changeset belongs to another story', details: { reason: 'VALIDATION_FAILED' } });
  }
  const live = buildChangeSetState(storyId);
  const validation = validateAiChangeSet(changeSet, live);
  if (!validation.ok) return Promise.resolve(mapChangeSetError(validation.code, validation.message));
  setPending({ changeSet, description: describeAiChangeSet(changeSet, live) });
  return waitForDecision().then(result => ({ ok: true as const, result }));
}

export function executeAuthorizeCapability(
  input: unknown,
  permissions: AiPermissions,
  setPending: (pending: AiChatPendingCapability) => void,
  waitForDecision: () => Promise<{ allowed: boolean }>,
) {
  const value = typeof input === 'object' && input ? input as Record<string, unknown> : {};
  const capability = value.capability;
  if (typeof capability !== 'string' || !AI_CAPABILITIES.includes(capability as AiCapability)) {
    return Promise.resolve({ ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: 'Unknown capability' });
  }
  const level = resolveCapability(capability as AiCapability, permissions);
  if (level === 'blocked') {
    return Promise.resolve({ ok: false as const, errorCode: 'PERMISSION_DENIED' as const, errorMessage: 'Capability is blocked', details: { reason: 'USER_BLOCKED' } });
  }
  if (level === 'auto') return Promise.resolve({ ok: true as const, result: { allowed: true } });
  const estimate = typeof value.estimate === 'string'
    ? value.estimate
    : value.estimate && typeof value.estimate === 'object'
      ? value.estimate as NonNullable<AiChatPendingCapability['estimate']>
      : undefined;
  setPending({ capability: capability as AiCapability, estimate });
  return waitForDecision().then(result => ({ ok: true as const, result }));
}

export function createAppToolExecutor(deps: AppToolExecutorDeps): AppToolExecutor {
  const { storyId } = deps;
  return async (toolCallId, name, input, toolContext) => {
    if (!APP_BRIDGE_TOOL_NAMES.includes(name)) return { ok: false, errorCode: 'PROTOCOL_ERROR', errorMessage: `Unsupported tool: ${name}` };
    const untrusted = toolContext?.untrustedAttachmentMode === true;
    const showCard = () => deps.beginInteraction(toolCallId, toolContext?.ttlMs, untrusted, true);
    const state = useAppStore.getState();
    const value = typeof input === 'object' && input ? input as Record<string, unknown> : {};
    const currentSceneId = deps.getActiveSceneId();
    if (name === 'get_story_overview') {
      const context = buildAiStoryContext(storyId, currentSceneId);
      return context
        ? { ok: true, result: { story: context.story, appearance: context.appearance, activeSceneId: currentSceneId } }
        : { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Story not found' };
    }
    if (name === 'list_scenes') return { ok: true, result: Object.values(state.sceneRecordsByStory[storyId] ?? {}).map(scene => ({ id: scene.id, name: scene.name })) };
    if (name === 'get_scene') {
      const sceneId = typeof value.sceneId === 'string' ? value.sceneId : currentSceneId;
      const context = sceneId ? buildAiStoryContext(storyId, sceneId) : null;
      return context ? { ok: true, result: context } : { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Scene not found' };
    }
    if (name === 'get_editor_context') {
      if (value.mode === 'live') {
        const capture = deps.getCaptureEditorContext();
        if (!capture) return { ok: true, result: { context: null, hint: 'No editor is open.' } };
        // Reading never saves: the author did not ask for anything to be written.
        const outcome = await capture({ save: false });
        return outcome.ok
          ? { ok: true, result: { context: deps.buildEditorContext(outcome.capture, 'live') } }
          : { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'The editor did not answer' };
      }
      const fixed = deps.getTurnEditorContext();
      const fixedScene = fixed?.scene ? state.sceneRecordsByStory[storyId]?.[fixed.scene.id] : null;
      if (fixed?.scene && (!fixedScene || computeSceneRevision(fixedScene) !== fixed.scene.revision)) {
        // Its addresses held for one revision of the scene, and that one is gone.
        deps.dropTurnEditorContext();
        return { ok: true, result: { context: null, hint: 'The scene changed after this context was captured. Read the scene again, or ask for mode "live".' } };
      }
      return fixed
        ? { ok: true, result: { context: fixed } }
        : { ok: true, result: { context: null, hint: 'No context came with this message. Ask for mode "live" to read the editor now.' } };
    }
    if (name === 'list_story_images') return { ok: true, result: listStoryImages(storyId) };
    if (name === 'get_image_details') {
      const details = typeof value.assetId === 'string' ? getImageDetails(storyId, value.assetId) : null;
      return details
        ? { ok: true, result: details }
        : { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Image not found in this story' };
    }
    if (name === 'find_asset_usage') {
      const usage = typeof value.assetId === 'string' ? findAssetUsage(storyId, value.assetId) : null;
      return usage
        ? { ok: true, result: usage }
        : { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Asset not found in this story' };
    }
    if (name === 'get_image_binary') {
      return typeof value.assetId === 'string'
        ? getStoryImageBinary(storyId, value.assetId)
        : { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'assetId is required' };
    }
    if (name === 'remove_background') {
      if (typeof value.assetId !== 'string') return { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'assetId is required' };
      const permission = resolveEffectiveCapability('image_generate', normalizeAiPermissions(useAppStore.getState().settings.aiPermissions), toolContext?.untrustedAttachmentMode === true);
      return executeRemoveBackground(
        storyId,
        value.assetId,
        permission,
        () => {
          deps.showCapability({ capability: 'image_generate' });
          return deps.waitForDecision().then(decision => Boolean((decision as { allowed?: boolean })?.allowed));
        },
        removeImageBackground,
        deps.keepImageResult,
      );
    }
    if (name === 'propose_scene_patch') {
      const patch = value.patch as AiScenePatch;
      const scene = state.sceneRecordsByStory[storyId]?.[patch?.sceneId];
      if (!scene) return { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Scene not found' };
      const validation = validateAiScenePatch(scene, patch, buildPatchProjectContext(storyId));
      if (!validation.ok) return { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: validation.errors.join('; ') };
      const permission = resolveEffectiveCapability('scene_edit', normalizeAiPermissions(useAppStore.getState().settings.aiPermissions), toolContext?.untrustedAttachmentMode === true);
      if (permission === 'blocked') return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Scene editing is blocked', details: { reason: 'USER_BLOCKED' } };
      if (permission === 'auto') {
        // No dialog is shown here, so nothing else would land the author's
        // draft first — and `validateAiScenePatch` above compared the patch
        // against the store, which is exactly what the draft has moved past.
        // Queued, because concurrent tool calls would otherwise interleave.
        // No card, but the bridge can still withdraw the call while the
        // author's draft is being saved in front of it.
        deps.beginInteraction(toolCallId, toolContext?.ttlMs, untrusted, false);
        // Made now, before the queue and the save: the gate then belongs to the
        // session this call came in, and closes with it.
        const mayWrite = deps.writeGate(toolCallId, 'scene_edit');
        const result = await deps.enqueueMutation(async () => {
          if (!(await deps.passesSaveBarrier())) return null;
          return applyAiScenePatchToStore(patch, mayWrite);
        }).finally(() => deps.settleInteraction(toolCallId));
        if (!result) {
          return { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Could not save the open document' };
        }
        if (!result.ok && isWriteRefusal(result.code)) return { ok: true, result: { accepted: false, reason: refusalReason(result.code) } };
        return result.ok
          ? { ok: true, result: { accepted: true, automatic: true } }
          : { ok: false, errorCode: result.code === 'STALE_REVISION' ? 'STALE_REVISION' : 'VALIDATION_FAILED', errorMessage: result.errors.join('; ') };
      }
      showCard();
      deps.showScenePatch({ patch, description: describeAiScenePatch(scene, patch) });
      return deps.waitForDecision().then(result => ({ ok: true as const, result }));
    }
    if (name === 'propose_appearance_patch') {
      const patch = value.patch as AiReaderAppearancePatch;
      const metadata = state.storiesMetadata.find((story) => story.id === storyId);
      if (!metadata) return { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Story not found' };
      const validation = validateAiAppearancePatch(metadata, patch);
      if (!validation.ok) return { ok: false, errorCode: validation.code, errorMessage: validation.errors.join('; ') };
      const permission = resolveEffectiveCapability('appearance', normalizeAiPermissions(useAppStore.getState().settings.aiPermissions), toolContext?.untrustedAttachmentMode === true);
      if (permission === 'blocked') return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Appearance editing is blocked', details: { reason: 'USER_BLOCKED' } };
      if (permission === 'auto') {
        const result = await applyAiAppearancePatchToStore(patch);
        return result.ok
          ? { ok: true, result: { accepted: true, automatic: true } }
          : { ok: false, errorCode: result.code === 'STALE_REVISION' ? 'STALE_REVISION' : 'VALIDATION_FAILED', errorMessage: result.errors.join('; ') };
      }
      showCard();
      deps.showAppearancePatch({ patch, description: describeAiAppearancePatch(metadata, patch) });
      return deps.waitForDecision().then(result => ({ ok: true as const, result }));
    }
    if (name === 'propose_changeset') {
      if (resolveEffectiveCapability('changeset', normalizeAiPermissions(useAppStore.getState().settings.aiPermissions), toolContext?.untrustedAttachmentMode === true) === 'blocked') {
        return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Story changes are blocked', details: { reason: 'USER_BLOCKED' } };
      }
      return executeProposeChangeSet(storyId, input, (pending) => { showCard(); deps.showChangeSet(pending); }, deps.waitForDecision);
    }
    if (name === 'authorize_capability') {
      const permissions = normalizeAiPermissions(useAppStore.getState().settings.aiPermissions);
      const effectivePermissions = toolContext?.untrustedAttachmentMode
        ? Object.fromEntries(AI_CAPABILITIES.map(capability => [capability, resolveEffectiveCapability(capability, permissions, true)])) as AiPermissions
        : permissions;
      return executeAuthorizeCapability(input, effectivePermissions, (pending) => { showCard(); deps.showCapability(pending); }, () => deps.waitForDecision() as Promise<{ allowed: boolean }>);
    }
    return { ok: false, errorCode: 'PROTOCOL_ERROR', errorMessage: `Unsupported tool: ${name}` };
  };
}
