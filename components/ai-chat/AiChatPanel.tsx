import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';
import { respond } from '@/lib/ai/fake-agent';
import { applyAiScenePatchToStore, rollbackAiPatch } from '@/lib/ai/scene-patch-adapter';
import { describeAiScenePatch, validateAiScenePatch, type PatchProjectContext } from '@/lib/ai/scene-patch';
import { applyAiAppearancePatchToStore, rollbackAiAppearancePatch } from '@/lib/ai/appearance-patch-adapter';
import { rollbackTopAppliedChange } from '@/lib/ai/applied-change-journal';
import { applyAiChangeSetToStore } from '@/lib/ai/change-set-adapter';
import {
  aiChangeSetSchema,
  describeAiChangeSet,
  validateAiChangeSet,
  type AiChangeSet,
  type AiChangeSetErrorCode,
  type AiChangeSetState,
} from '@/lib/ai/change-set';
import {
  describeAiAppearancePatch,
  validateAiAppearancePatch,
  type AiReaderAppearancePatch,
} from '@/lib/ai/appearance-patch';
import { findAssetUsage, getImageDetails, listStoryImages } from '@/lib/ai/asset-tools';
import {
  decodeImageResult,
  blobToBase64,
  downscaleImage,
  executeRemoveBackground,
  fromPendingAiImage,
  getStoryImageBinary,
  toPendingAiImage,
  type AiImageResult,
} from '@/lib/ai/image-tools';
import { pendingImageRepository } from '@/lib/ai/pending-image-storage.web';
import { chatAttachmentRepository } from '@/lib/ai/attachment-storage.web';
import {
  detectAttachment,
  MAX_BINARY_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
  type AttachmentRef,
  type StoredChatAttachment,
} from '@/lib/ai/attachments';
import { APP_BRIDGE_TOOL_NAMES } from '@/lib/ai/bridge-tools';
import { AI_CAPABILITIES, normalizeAiPermissions, resolveCapability, resolveEffectiveCapability, type AiCapability, type AiPermissions } from '@/lib/ai/permissions';
import { resolveAiBridgeConfig } from '@/lib/ai/bridge-config';
import { buildAiStoryContext } from '@/lib/ai/story-context';
import { getStoryImageAssets } from '@/lib/story-image-library';
import { BridgeClient, type BridgeConnectionState, type BridgeProvider } from '@/lib/bridge-client';
import type { BridgeCapabilities } from '@/lib/bridge-protocol';
import { removeImageBackground } from '@/lib/remove-background.web';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import { useAppStore } from '@/stores/use-app-store';
import { addAssetToLibrary } from '@/stores/media-library-actions';
import {
  useAiChatStore,
  type AiChatPendingCapability,
  type AiChatPendingChangeSet,
  type AiChatRole,
} from '@/stores/ai-chat-store';
import { AppearancePreviewCard } from './AppearancePreviewCard';
import { PatchPreviewCard } from './PatchPreviewCard';
import { ChangeSetPreviewCard } from './ChangeSetPreviewCard';
import { ConnectionCard } from './ConnectionCard';
import { MarkdownText } from './MarkdownText';
import { AiSettingsPanel } from './AiSettingsPanel';
import { CapabilityConfirmChip } from './CapabilityConfirmChip';
import { ImageResultCard } from './ImageResultCard';

interface AiChatPanelProps {
  storyId: string;
  activeSceneId: string | null;
  colorScheme?: ColorScheme;
}

type BridgeRuntimeErrorReason =
  | 'TURN_ALREADY_RUNNING'
  | 'TOOL_LIMIT_EXCEEDED'
  | 'PERMISSION_DENIED'
  | 'CANCELLED'
  | 'PROTOCOL_ERROR'
  | 'VALIDATION_FAILED'
  | 'OPENAI_API_AUTH_FAILED'
  | 'OPENAI_API_FORBIDDEN'
  | 'OPENAI_RATE_LIMITED'
  | 'OPENAI_MODEL_UNAVAILABLE'
  | 'OPENAI_API_TIMEOUT'
  | 'OPENAI_RESPONSE_INCOMPLETE'
  | 'OPENAI_MALFORMED_RESPONSE'
  | 'OPENAI_REFUSAL'
  | 'OPENAI_STREAM_TOO_LARGE'
  | 'OPENAI_STREAM_EVENT_TOO_LARGE'
  | 'OPENAI_STREAM_INCOMPLETE'
  | 'OPENAI_API_FAILED'
  | 'OPENAI_ROUND_LIMIT'
  | 'OPENAI_PARALLEL_TOOL_CALLS'
  | 'OPENAI_MALFORMED_FUNCTION_CALL'
  | 'OPENAI_NON_REPLAYABLE_REASONING'
  | 'OPENAI_REQUEST_TOO_LARGE'
  | 'OPENAI_SESSION_BUDGET_EXHAUSTED'
  | 'GEMINI_API_AUTH_FAILED'
  | 'GEMINI_API_FORBIDDEN'
  | 'GEMINI_RATE_LIMITED'
  | 'GEMINI_MODEL_UNAVAILABLE'
  | 'GEMINI_API_TIMEOUT'
  | 'GEMINI_RESPONSE_INCOMPLETE'
  | 'GEMINI_MALFORMED_RESPONSE'
  | 'GEMINI_REFUSAL'
  | 'GEMINI_STREAM_TOO_LARGE'
  | 'GEMINI_STREAM_EVENT_TOO_LARGE'
  | 'GEMINI_STREAM_INCOMPLETE'
  | 'GEMINI_API_FAILED'
  | 'GEMINI_ROUND_LIMIT'
  | 'GEMINI_MALFORMED_FUNCTION_CALL'
  | 'GEMINI_REQUEST_TOO_LARGE'
  | 'GEMINI_SESSION_BUDGET_EXHAUSTED'
  | 'PROVIDER_ERROR';

const OPENAI_RUNTIME_REASONS = new Set<BridgeRuntimeErrorReason>([
  'OPENAI_API_AUTH_FAILED', 'OPENAI_API_FORBIDDEN', 'OPENAI_RATE_LIMITED', 'OPENAI_MODEL_UNAVAILABLE',
  'OPENAI_API_TIMEOUT', 'OPENAI_RESPONSE_INCOMPLETE', 'OPENAI_MALFORMED_RESPONSE', 'OPENAI_REFUSAL',
  'OPENAI_STREAM_TOO_LARGE', 'OPENAI_STREAM_EVENT_TOO_LARGE', 'OPENAI_STREAM_INCOMPLETE',
  'OPENAI_API_FAILED', 'OPENAI_ROUND_LIMIT', 'OPENAI_PARALLEL_TOOL_CALLS',
  'OPENAI_MALFORMED_FUNCTION_CALL', 'OPENAI_NON_REPLAYABLE_REASONING', 'OPENAI_REQUEST_TOO_LARGE',
  'OPENAI_SESSION_BUDGET_EXHAUSTED',
  'GEMINI_API_AUTH_FAILED', 'GEMINI_API_FORBIDDEN', 'GEMINI_RATE_LIMITED', 'GEMINI_MODEL_UNAVAILABLE',
  'GEMINI_API_TIMEOUT', 'GEMINI_RESPONSE_INCOMPLETE', 'GEMINI_MALFORMED_RESPONSE', 'GEMINI_REFUSAL',
  'GEMINI_STREAM_TOO_LARGE', 'GEMINI_STREAM_EVENT_TOO_LARGE', 'GEMINI_STREAM_INCOMPLETE',
  'GEMINI_API_FAILED', 'GEMINI_ROUND_LIMIT',
  'GEMINI_MALFORMED_FUNCTION_CALL', 'GEMINI_REQUEST_TOO_LARGE', 'GEMINI_SESSION_BUDGET_EXHAUSTED',
]);

function resolveBridgeRuntimeError(payload: Record<string, unknown>): BridgeRuntimeErrorReason {
  const details = typeof payload.details === 'object' && payload.details
    ? payload.details as Record<string, unknown>
    : {};
  if (details.reason === 'TURN_ALREADY_RUNNING' || details.reason === 'TOOL_LIMIT_EXCEEDED' || details.reason === 'PROVIDER_ERROR') {
    return details.reason;
  }
  if (typeof details.reason === 'string' && OPENAI_RUNTIME_REASONS.has(details.reason as BridgeRuntimeErrorReason)) {
    return details.reason as BridgeRuntimeErrorReason;
  }
  if (payload.code === 'PERMISSION_DENIED' || payload.code === 'CANCELLED' || payload.code === 'PROTOCOL_ERROR' || payload.code === 'VALIDATION_FAILED') {
    return payload.code;
  }
  return 'PROVIDER_ERROR';
}

function buildPatchProjectContext(storyId: string): PatchProjectContext {
  const state = useAppStore.getState();
  const storyScenes = Object.values(state.sceneRecordsByStory[storyId] ?? {});
  return {
    sceneIds: storyScenes.map((scene) => scene.id),
    characterIds: (state.characterLibraries[storyId] ?? []).map((character) => character.id),
    variableNames: Array.from(new Set(storyScenes.flatMap((scene) => Object.keys(scene.sceneState.variables)))),
    assetIds: getStoryImageAssets(storyId, state.imageAssetIdsByStory, state.mediaLibrary).map((asset) => asset.id),
  };
}

function buildChangeSetState(storyId: string): AiChangeSetState {
  const state = useAppStore.getState();
  const scenes = new Map(Object.entries(state.sceneRecordsByStory[storyId] ?? {}));
  const characters = state.characterLibraries[storyId] ?? [];
  return {
    scenes,
    characters,
    context: {
      ...buildPatchProjectContext(storyId),
      sceneOrder: state.storiesMetadata.find((story) => story.id === storyId)?.sceneOrder,
    },
  };
}

function mapChangeSetError(code: AiChangeSetErrorCode, message: string) {
  return code === 'STALE_REVISION'
    ? { ok: false as const, errorCode: 'STALE_REVISION' as const, errorMessage: message }
    : { ok: false as const, errorCode: 'VALIDATION_FAILED' as const, errorMessage: message, details: { reason: code } };
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

export function AiChatPanel({ storyId, activeSceneId, colorScheme }: AiChatPanelProps) {
  const colors = useColors(colorScheme);
  const { t, language } = useI18n();

  const messages = useAiChatStore((s) => s.messages);
  const status = useAiChatStore((s) => s.status);
  const pendingInteraction = useAiChatStore((s) => s.pendingInteraction);
  const pendingPatch = pendingInteraction?.storyId === storyId && pendingInteraction.kind === 'scene_patch'
    ? pendingInteraction.value
    : null;
  const pendingAppearance = pendingInteraction?.storyId === storyId && pendingInteraction.kind === 'appearance'
    ? pendingInteraction.value
    : null;
  const pendingChangeSet = pendingInteraction?.storyId === storyId && pendingInteraction.kind === 'changeset'
    ? pendingInteraction.value
    : null;
  const pendingCapability = pendingInteraction?.storyId === storyId && pendingInteraction.kind === 'capability'
    ? pendingInteraction.value
    : null;
  const lastAppliedChange = useAiChatStore((s) => s.lastAppliedChange);
  const addMessageToStore = useAiChatStore((s) => s.addMessage);
  const setActiveStory = useAiChatStore((s) => s.setActiveStory);
  const clearMessages = useAiChatStore((s) => s.clearMessages);
  const markAttachmentImported = useAiChatStore((s) => s.markAttachmentImported);
  const restored = useAiChatStore((s) => s.restoredStoryIds[storyId] === true);
  const addMessage = useCallback((role: AiChatRole, text: string, attachments?: AttachmentRef[]) => addMessageToStore(role, text, storyId, attachments), [addMessageToStore, storyId]);
  const setStatus = useAiChatStore((s) => s.setStatus);
  const setPendingInteraction = useAiChatStore((s) => s.setPendingInteraction);
  const cancelPendingInteraction = useAiChatStore((s) => s.cancelPendingInteraction);
  const setPendingPatch = useCallback((value: NonNullable<typeof pendingPatch> | null) => {
    setPendingInteraction(value ? { kind: 'scene_patch', storyId, value } : null);
  }, [setPendingInteraction, storyId]);
  const setPendingAppearance = useCallback((value: NonNullable<typeof pendingAppearance> | null) => {
    setPendingInteraction(value ? { kind: 'appearance', storyId, value } : null);
  }, [setPendingInteraction, storyId]);
  const setPendingChangeSet = useCallback((value: AiChatPendingChangeSet | null) => {
    setPendingInteraction(value ? { kind: 'changeset', storyId, value } : null);
  }, [setPendingInteraction, storyId]);
  const setPendingCapability = useCallback((value: AiChatPendingCapability | null) => {
    setPendingInteraction(value ? { kind: 'capability', storyId, value } : null);
  }, [setPendingInteraction, storyId]);
  const setLastAppliedChange = useAiChatStore((s) => s.setLastAppliedChange);
  const aiBridgeSettings = useAppStore((s) => s.aiBridgeSettings)
    ?? { url: '', token: '', disabled: false };
  const updateAiBridgeSettings = useAppStore((s) => s.updateAiBridgeSettings);
  const settings = useAppStore((s) => s.settings);
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const bridgeConfig = resolveAiBridgeConfig(aiBridgeSettings);

  const [inputText, setInputText] = useState('');
  const [applying, setApplying] = useState(false);
  const [connectionState, setConnectionState] = useState<'demo' | BridgeConnectionState>(bridgeConfig.enabled ? 'connecting' : 'demo');
  const [connectionReason, setConnectionReason] = useState<string>();
  const [provider, setProvider] = useState<BridgeProvider>();
  const [capabilities, setCapabilities] = useState<BridgeCapabilities>();
  const [draftAttachments, setDraftAttachments] = useState<StoredChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string>();
  const [attachmentDropActive, setAttachmentDropActive] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [imageResults, setImageResults] = useState<AiImageResult[]>([]);
  const [runtimeErrorReason, setRuntimeErrorReason] = useState<BridgeRuntimeErrorReason>();
  const [clearingChat, setClearingChat] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [imagePersistenceFailed, setImagePersistenceFailed] = useState(false);
  const bridgeRef = useRef<BridgeClient | null>(null);
  const composerRef = useRef<View | null>(null);
  const attachmentAddingRef = useRef(false);
  const activeSceneIdRef = useRef(activeSceneId);
  const imageResultIdsRef = useRef(new Set<string>());
  const assistantTextRef = useRef('');
  const patchDecisionRef = useRef<((value: unknown) => void) | null>(null);

  useEffect(() => setActiveStory(storyId), [setActiveStory, storyId]);
  useEffect(() => { activeSceneIdRef.current = activeSceneId; }, [activeSceneId]);
  useEffect(() => {
    let active = true;
    void pendingImageRepository.listForStory(storyId).then((images) => {
      if (!active) return;
      imageResultIdsRef.current = new Set(images.map((image) => image.requestId));
      setImageResults(images.map(fromPendingAiImage));
    }).catch(() => {
      if (active) setRuntimeErrorReason('PROVIDER_ERROR');
    });
    return () => { active = false; };
  }, [storyId]);
  useEffect(() => {
    if (!storiesMetadata.length) return;
    void pendingImageRepository.cleanup({
      existingStoryIds: new Set(storiesMetadata.map((story) => story.id)),
    }).catch(() => {
      // Cleanup is best-effort; delivery persistence reports its own failures.
    });
  }, [storiesMetadata]);

  useEffect(() => {
    const token = bridgeConfig.token;
    const url = bridgeConfig.url;
    const enabled = bridgeConfig.enabled;
    if (!enabled || typeof WebSocket === 'undefined') {
      setConnectionState(aiBridgeSettings.disabled && aiBridgeSettings.token ? 'closed' : 'demo');
      return;
    }
    setConnectionState('connecting');
    setConnectionReason(undefined);
    setRuntimeErrorReason(undefined);
    const client = new BridgeClient({
      url,
      token,
      locale: language,
      preferredProvider: bridgeConfig.preferredProvider,
      codexBetaConsent: bridgeConfig.codexBetaConsent,
      requestedModel: bridgeConfig.requestedModel,
      requestedTokenBudget: bridgeConfig.requestedTokenBudget,
      onConnectionChange: (next, reason) => {
        setConnectionState(next);
        setConnectionReason(reason);
        if (next === 'unauthorized' || next === 'closed') {
          assistantTextRef.current = '';
          patchDecisionRef.current?.({ accepted: false, allowed: false, reason: reason ?? next });
          patchDecisionRef.current = null;
          cancelPendingInteraction(storyId);
          setStatus('idle');
        }
      },
      onEvent: (message) => {
        const payload = typeof message.payload === 'object' && message.payload ? message.payload as Record<string, unknown> : {};
        if (message.type === 'session_started' && (payload.provider === 'claude' || payload.provider === 'openai' || payload.provider === 'codex' || payload.provider === 'gemini')) {
          setProvider(payload.provider);
          if (payload.capabilities && typeof payload.capabilities === 'object') setCapabilities(payload.capabilities as BridgeCapabilities);
        }
        if (message.type === 'session_challenge' && typeof payload.reason === 'string') setConnectionReason(payload.reason);
        if (message.type === 'image_result' && typeof payload.requestId === 'string') {
          const result = decodeImageResult(payload);
          if (!result) return;
          const isNew = !imageResultIdsRef.current.has(result.requestId);
          imageResultIdsRef.current.add(result.requestId);
          void pendingImageRepository.put(toPendingAiImage(result, storyId)).then((persisted) => {
            URL.revokeObjectURL(result.blobUrl);
            setImagePersistenceFailed(false);
            if (isNew) {
              setImageResults((current) => current.some((item) => item.requestId === persisted.requestId)
                ? current
                : [...current, fromPendingAiImage(persisted)]);
            }
            client.acknowledgeImageResult(result.requestId);
          }).catch(() => {
            URL.revokeObjectURL(result.blobUrl);
            imageResultIdsRef.current.delete(result.requestId);
            setImagePersistenceFailed(true);
          });
        }
        if (message.type === 'assistant_delta' && typeof payload.text === 'string') assistantTextRef.current += payload.text;
        if (message.type === 'assistant_done') {
          const incompleteWarning = payload.stopReason === 'incomplete' ? t('aiChat.incompleteWarning') : '';
          if (assistantTextRef.current || incompleteWarning) {
            addMessage('assistant', [assistantTextRef.current, incompleteWarning].filter(Boolean).join('\n\n'));
          }
          assistantTextRef.current = '';
          const chat = useAiChatStore.getState();
          setStatus(chat.pendingInteraction?.storyId === storyId ? 'awaiting_confirmation' : 'idle');
        }
        if (message.type === 'error') {
          setRuntimeErrorReason(resolveBridgeRuntimeError(payload));
          setStatus('idle');
        }
      },
      onToolCall: async (_id, name, input, toolContext) => {
        if (!APP_BRIDGE_TOOL_NAMES.includes(name)) return { ok: false, errorCode: 'PROTOCOL_ERROR', errorMessage: `Unsupported tool: ${name}` };
        const state = useAppStore.getState();
        const value = typeof input === 'object' && input ? input as Record<string, unknown> : {};
        const currentSceneId = activeSceneIdRef.current;
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
              setPendingCapability({ capability: 'image_generate' });
              return new Promise<boolean>((resolve) => { patchDecisionRef.current = value => resolve(Boolean((value as { allowed?: boolean })?.allowed)); });
            },
            removeImageBackground,
            async result => {
              const persisted = await pendingImageRepository.put(toPendingAiImage(result, storyId));
              URL.revokeObjectURL(result.blobUrl);
              imageResultIdsRef.current.add(persisted.requestId);
              setImageResults(current => current.some(item => item.requestId === persisted.requestId)
                ? current
                : [...current, fromPendingAiImage(persisted)]);
            },
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
            const result = await applyAiScenePatchToStore(patch);
            return result.ok
              ? { ok: true, result: { accepted: true, automatic: true } }
              : { ok: false, errorCode: result.code === 'STALE_REVISION' ? 'STALE_REVISION' : 'VALIDATION_FAILED', errorMessage: result.errors.join('; ') };
          }
          setPendingPatch({ patch, description: describeAiScenePatch(scene, patch) });
          return new Promise(resolve => { patchDecisionRef.current = result => resolve({ ok: true, result }); });
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
          setPendingAppearance({ patch, description: describeAiAppearancePatch(metadata, patch) });
          return new Promise(resolve => { patchDecisionRef.current = result => resolve({ ok: true, result }); });
        }
        if (name === 'propose_changeset') {
          if (resolveEffectiveCapability('changeset', normalizeAiPermissions(useAppStore.getState().settings.aiPermissions), toolContext?.untrustedAttachmentMode === true) === 'blocked') {
            return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Story changes are blocked', details: { reason: 'USER_BLOCKED' } };
          }
          return executeProposeChangeSet(storyId, input, setPendingChangeSet, () => new Promise(resolve => { patchDecisionRef.current = resolve; }));
        }
        if (name === 'authorize_capability') {
          const permissions = normalizeAiPermissions(useAppStore.getState().settings.aiPermissions);
          const effectivePermissions = toolContext?.untrustedAttachmentMode
            ? Object.fromEntries(AI_CAPABILITIES.map(capability => [capability, resolveEffectiveCapability(capability, permissions, true)])) as AiPermissions
            : permissions;
          return executeAuthorizeCapability(input, effectivePermissions, setPendingCapability, () => new Promise(resolve => { patchDecisionRef.current = resolve as (value: unknown) => void; }));
        }
        return { ok: false, errorCode: 'PROTOCOL_ERROR', errorMessage: `Unsupported tool: ${name}` };
      },
    });
    bridgeRef.current = client;
    client.connect();
    return () => {
      patchDecisionRef.current?.({ accepted: false, allowed: false, reason: 'panel_closed' });
      patchDecisionRef.current = null;
      cancelPendingInteraction(storyId);
      client.close();
      bridgeRef.current = null;
    };
  }, [storyId, bridgeConfig.enabled, bridgeConfig.url, bridgeConfig.token, bridgeConfig.preferredProvider, bridgeConfig.codexBetaConsent, bridgeConfig.requestedModel, bridgeConfig.requestedTokenBudget, aiBridgeSettings.disabled, aiBridgeSettings.token, language, retryKey, addMessage, cancelPendingInteraction, setPendingPatch, setPendingAppearance, setPendingChangeSet, setPendingCapability, setStatus, t]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if ((!text && draftAttachments.length === 0) || status !== 'idle') return;
    const ctx = activeSceneId ? buildAiStoryContext(storyId, activeSceneId) : null;
    if (!ctx) {
      addMessage('assistant', t('aiChat.noActiveScene'));
      return;
    }

    if (bridgeRef.current) {
      if (connectionState !== 'connected') return;
      assistantTextRef.current = '';
      let wireAttachments;
      try {
        wireAttachments = await Promise.all(draftAttachments.map(async (attachment) => ({
          id: attachment.id, name: attachment.name, kind: attachment.kind, mimeType: attachment.mimeType,
          byteSize: attachment.byteSize, base64: await blobToBase64(attachment.blob),
        })));
      } catch {
        setAttachmentError(t('aiChat.attach.readFailed'));
        return;
      }
      const delivered = bridgeRef.current.sendUserMessage(text, wireAttachments);
      if (!delivered.ok) {
        setInputText(text);
        setStatus('idle');
        setRuntimeErrorReason('PROVIDER_ERROR');
        return;
      }
      setRuntimeErrorReason(undefined);
      setInputText('');
      const refs = draftAttachments.map(({ blob: _blob, storyId: _storyId, createdAt: _createdAt, messageId: _messageId, ...ref }) => ref);
      const message = addMessage('user', text, refs);
      await Promise.all(draftAttachments.map((attachment) => chatAttachmentRepository.put({ ...attachment, messageId: message.id })));
      setDraftAttachments([]);
      setStatus('thinking');
      return;
    }
    setRuntimeErrorReason(undefined);
    setInputText('');
    addMessage('user', text);
    setStatus('thinking');
    const response = await respond(text, ctx);

    if (response.kind === 'text') {
      addMessage('assistant', response.text);
      setStatus('idle');
      return;
    }

    if (response.kind === 'appearance') {
      const metadata = useAppStore.getState().storiesMetadata.find((story) => story.id === storyId);
      if (!metadata) {
        addMessage('assistant', t('aiChat.applyFailedGeneric'));
        setStatus('idle');
        return;
      }

      const validation = validateAiAppearancePatch(metadata, response.patch);
      if (!validation.ok) {
        addMessage('assistant', t('aiChat.applyFailedValidation', { errors: validation.errors.join('; ') }));
        setStatus('idle');
        return;
      }

      addMessage('assistant', response.patch.explanation);
      setPendingAppearance({ patch: response.patch, description: describeAiAppearancePatch(metadata, response.patch) });
      return;
    }

    const scene = useAppStore.getState().sceneRecordsByStory[storyId]?.[response.patch.sceneId];
    if (!scene) {
      addMessage('assistant', t('aiChat.applyFailedGeneric'));
      setStatus('idle');
      return;
    }

    const validation = validateAiScenePatch(scene, response.patch, buildPatchProjectContext(storyId));
    if (!validation.ok) {
      addMessage('assistant', t('aiChat.applyFailedValidation', { errors: validation.errors.join('; ') }));
      setStatus('idle');
      return;
    }

    const description = describeAiScenePatch(scene, response.patch);
    addMessage('assistant', response.patch.explanation);
    setPendingPatch({ patch: response.patch, description });
  }, [inputText, draftAttachments, status, activeSceneId, storyId, addMessage, setStatus, setPendingPatch, setPendingAppearance, t, connectionState]);

  const addDraftFiles = useCallback(async (files: readonly File[]) => {
    if (!files.length) return;
    if (attachmentAddingRef.current) {
      setAttachmentError(t('aiChat.attach.wait'));
      return;
    }
    attachmentAddingRef.current = true;
    setAttachmentError(undefined);
    const added: StoredChatAttachment[] = [];
    try {
      const remaining = MAX_CHAT_ATTACHMENTS - draftAttachments.length;
      if (remaining <= 0) {
        setAttachmentError(t('aiChat.attach.limit'));
        return;
      }
      const selected = files.slice(0, remaining);
      let totalBytes = draftAttachments.reduce((sum, attachment) => sum + attachment.byteSize, 0);
      for (const file of selected) {
        if (!file.size || file.size > MAX_BINARY_ATTACHMENT_BYTES) {
          throw new Error('attachment size is invalid');
        }
        let blob: Blob = file;
        let detected = detectAttachment(new Uint8Array(await blob.arrayBuffer()));
        if (detected.kind === 'image') {
          const sanitized = await downscaleImage(blob);
          if (!sanitized) throw new Error('image sanitation failed');
          blob = sanitized;
          detected = detectAttachment(new Uint8Array(await blob.arrayBuffer()));
        }
        const itemLimit = detected.kind === 'text' ? MAX_TEXT_ATTACHMENT_BYTES : MAX_BINARY_ATTACHMENT_BYTES;
        totalBytes += blob.size;
        if (!blob.size || blob.size > itemLimit || totalBytes > MAX_MESSAGE_ATTACHMENT_BYTES) {
          throw new Error('attachment size is invalid');
        }
        const value: StoredChatAttachment = {
          id: crypto.randomUUID(), storyId, name: sanitizeAttachmentName(file.name || `attachment-${Date.now()}`),
          kind: detected.kind, mimeType: detected.mimeType, byteSize: blob.size, blob, createdAt: Date.now(),
        };
        added.push(value);
      }
      await Promise.all(added.map(value => chatAttachmentRepository.put(value)));
      setDraftAttachments(current => [...current, ...added]);
      if (files.length > selected.length) setAttachmentError(t('aiChat.attach.limit'));
    } catch {
      await Promise.allSettled(added.map(value => chatAttachmentRepository.delete(value.id)));
      setAttachmentError(t('aiChat.attach.invalid'));
    } finally {
      attachmentAddingRef.current = false;
    }
  }, [draftAttachments, storyId, t]);

  const handleAttach = useCallback(() => {
    if (typeof document === 'undefined') return;
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.accept = 'image/jpeg,image/png,image/webp,application/pdf,text/plain,text/markdown,.md,.fountain';
    picker.onchange = () => { void addDraftFiles(Array.from(picker.files ?? [])); };
    picker.click();
  }, [addDraftFiles]);

  const attachmentsSupported = connectionState === 'connected' && capabilities?.attachments.supported === true;
  const canAttach = attachmentsSupported && status === 'idle' && draftAttachments.length < MAX_CHAT_ATTACHMENTS;
  const attachmentHelp = connectionState !== 'connected'
    ? t('aiChat.attach.connectFirst')
    : !capabilities?.attachments.supported
      ? provider === 'codex'
        ? t('aiChat.attach.codexUnsupported')
        : provider === 'claude'
          ? t('aiChat.attach.claudeUnavailable')
          : t('aiChat.attach.providerUnsupported')
      : status !== 'idle'
        ? t('aiChat.attach.wait')
        : draftAttachments.length >= MAX_CHAT_ATTACHMENTS
          ? t('aiChat.attach.limit')
          : t('aiChat.attach.hint');

  const handleAttachmentButton = useCallback(() => {
    if (!canAttach) {
      setAttachmentError(attachmentHelp);
      return;
    }
    handleAttach();
  }, [attachmentHelp, canAttach, handleAttach]);

  useEffect(() => {
    if (typeof HTMLElement === 'undefined') return;
    const node = composerRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const filesFrom = (list: FileList | null | undefined) => Array.from(list ?? []);
    const onDragOver = (event: DragEvent) => {
      if (!canAttach || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setAttachmentDropActive(true);
    };
    const onDragLeave = (event: DragEvent) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || !node.contains(next)) setAttachmentDropActive(false);
    };
    const onDrop = (event: DragEvent) => {
      const files = filesFrom(event.dataTransfer?.files);
      if (!files.length) return;
      event.preventDefault();
      setAttachmentDropActive(false);
      if (canAttach) void addDraftFiles(files);
      else setAttachmentError(attachmentHelp);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = filesFrom(event.clipboardData?.files);
      if (!files.length) return;
      event.preventDefault();
      if (canAttach) void addDraftFiles(files);
      else setAttachmentError(attachmentHelp);
    };
    node.addEventListener('dragover', onDragOver);
    node.addEventListener('dragleave', onDragLeave);
    node.addEventListener('drop', onDrop);
    node.addEventListener('paste', onPaste);
    return () => {
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('dragleave', onDragLeave);
      node.removeEventListener('drop', onDrop);
      node.removeEventListener('paste', onPaste);
    };
  }, [addDraftFiles, attachmentHelp, canAttach]);

  const handleApply = useCallback(async () => {
    if (!pendingPatch) return;
    setApplying(true);
    try {
      const result = await applyAiScenePatchToStore(pendingPatch.patch);
      if (result.ok) {
        addMessage('system', t('aiChat.applySuccess'));
        patchDecisionRef.current?.({ accepted: true });
      } else {
        const message =
          result.code === 'STALE_REVISION'
            ? t('aiChat.applyFailedStale')
            : result.code === 'VALIDATION_FAILED'
              ? t('aiChat.applyFailedValidation', { errors: result.errors.join('; ') })
              : t('aiChat.applyFailedGeneric');
        addMessage('system', message);
        patchDecisionRef.current?.({ accepted: false, reason: result.code });
      }
    } finally {
      setApplying(false);
      setPendingPatch(null);
      patchDecisionRef.current = null;
    }
  }, [pendingPatch, addMessage, setPendingPatch, t]);

  const handleReject = useCallback(() => {
    setPendingPatch(null);
    addMessage('system', t('aiChat.rejected'));
    patchDecisionRef.current?.({ accepted: false, reason: 'rejected' });
    patchDecisionRef.current = null;
  }, [addMessage, setPendingPatch, t]);

  const handleApplyAppearance = useCallback(async () => {
    if (!pendingAppearance) return;
    setApplying(true);
    try {
      const result = await applyAiAppearancePatchToStore(pendingAppearance.patch);
      if (result.ok) {
        addMessage('system', t('aiChat.applySuccess'));
        patchDecisionRef.current?.({ accepted: true });
      } else {
        const message =
          result.code === 'STALE_REVISION'
            ? t('aiChat.applyFailedStale')
            : result.code === 'VALIDATION_FAILED'
              ? t('aiChat.applyFailedValidation', { errors: result.errors.join('; ') })
              : t('aiChat.applyFailedGeneric');
        addMessage('system', message);
        patchDecisionRef.current?.({ accepted: false, reason: result.code });
      }
    } finally {
      setApplying(false);
      setPendingAppearance(null);
      patchDecisionRef.current = null;
    }
  }, [pendingAppearance, addMessage, setPendingAppearance, t]);

  const handleRejectAppearance = useCallback(() => {
    setPendingAppearance(null);
    addMessage('system', t('aiChat.rejected'));
    patchDecisionRef.current?.({ accepted: false, reason: 'rejected' });
    patchDecisionRef.current = null;
  }, [addMessage, setPendingAppearance, t]);

  const handleApplyChangeSet = useCallback(async () => {
    if (!pendingChangeSet) return;
    setApplying(true);
    try {
      const result = await applyAiChangeSetToStore(pendingChangeSet.changeSet);
      if (result.ok) {
        addMessage('system', t('aiChat.applySuccess'));
        patchDecisionRef.current?.({ accepted: true, summary: pendingChangeSet.description });
      } else {
        addMessage('system', result.code === 'STALE_REVISION' ? t('aiChat.applyFailedStale') : t('aiChat.applyFailedValidation', { errors: result.message }));
        patchDecisionRef.current?.({ accepted: false, reason: result.code });
      }
    } finally {
      setApplying(false);
      setPendingChangeSet(null);
      patchDecisionRef.current = null;
    }
  }, [pendingChangeSet, addMessage, setPendingChangeSet, t]);

  const handleRejectChangeSet = useCallback(() => {
    setPendingChangeSet(null);
    addMessage('system', t('aiChat.rejected'));
    patchDecisionRef.current?.({ accepted: false, reason: 'rejected' });
    patchDecisionRef.current = null;
  }, [addMessage, setPendingChangeSet, t]);

  const handleRollback = useCallback(async () => {
    if (!lastAppliedChange) return;
    const journalTop = useAiChatStore.getState().getTopAppliedChange(storyId);
    const hasJournalEntry = !!journalTop
      && journalTop.kind === lastAppliedChange.kind
      && journalTop.storyId === lastAppliedChange.storyId;
    const result = hasJournalEntry
      ? await rollbackTopAppliedChange(storyId)
      : { ok: lastAppliedChange.kind === 'scene' || lastAppliedChange.kind === 'changeset'
          ? await rollbackAiPatch(lastAppliedChange.storyId, lastAppliedChange.snapshotId)
          : rollbackAiAppearancePatch(
              lastAppliedChange.storyId,
              lastAppliedChange.previousTheme,
              lastAppliedChange.previousLayoutPreset,
            ) };
    if (result.requiresConfirmation) {
      setConfirmUndo(true);
      return;
    }
    addMessage('system', result.ok ? t('aiChat.rollbackSuccess') : t('aiChat.rollbackFailed'));
    if (result.ok && !hasJournalEntry) setLastAppliedChange(null);
  }, [lastAppliedChange, addMessage, setLastAppliedChange, storyId, t]);

  const handleForceRollback = useCallback(async () => {
    const result = await rollbackTopAppliedChange(storyId, true);
    setConfirmUndo(false);
    addMessage('system', result.ok ? t('aiChat.rollbackSuccess') : t('aiChat.rollbackFailed'));
  }, [addMessage, storyId, t]);

  const canSend = status === 'idle'
    && (inputText.trim().length > 0 || draftAttachments.length > 0)
    && (draftAttachments.length === 0 || (connectionState === 'connected' && attachmentsSupported))
    && (connectionState === 'demo' || connectionState === 'connected');

  const handleStop = useCallback(() => {
    if (status !== 'thinking') return;
    const result = bridgeRef.current?.interrupt();
    if (result?.ok) setStatus('interrupting');
  }, [setStatus, status]);

  const resolveCapabilityDecision = useCallback((allowed: boolean) => {
    patchDecisionRef.current?.({ allowed });
    patchDecisionRef.current = null;
    setPendingCapability(null);
  }, [setPendingCapability]);

  const handleConnect = useCallback((token: string, url: string, preferredProvider: BridgeProvider) => {
    setProvider(undefined);
    setConnectionReason(undefined);
    updateAiBridgeSettings({ token, url, disabled: false, preferredProvider });
    setRetryKey(value => value + 1);
  }, [updateAiBridgeSettings]);

  const handleRetryConnection = useCallback(() => {
    updateAiBridgeSettings({ disabled: false });
    setConnectionReason(undefined);
    setRetryKey(value => value + 1);
  }, [updateAiBridgeSettings]);

  const handleDisconnect = useCallback(() => {
    bridgeRef.current?.close();
    updateAiBridgeSettings({
      url: aiBridgeSettings.url || bridgeConfig.url,
      token: aiBridgeSettings.token || bridgeConfig.token,
      disabled: true,
    });
    setConnectionState('closed');
    setConnectionReason(undefined);
  }, [aiBridgeSettings.token, aiBridgeSettings.url, bridgeConfig.token, bridgeConfig.url, updateAiBridgeSettings]);

  const handleResetConnection = useCallback(() => {
    bridgeRef.current?.close();
    BridgeClient.clearPersistedSession(bridgeConfig.url);
    updateAiBridgeSettings({ url: '', token: '', disabled: true, preferredProvider: 'openai', codexBetaConsent: undefined });
    setProvider(undefined);
    setConnectionReason(undefined);
    setConnectionState('demo');
  }, [bridgeConfig.url, updateAiBridgeSettings]);

  const handleResetConversation = useCallback(async () => {
    if (clearingChat) return;
    if (connectionState === 'demo') {
      clearMessages(storyId);
      return;
    }
    const client = bridgeRef.current;
    if (!client || connectionState !== 'connected') return;
    setClearingChat(true);
    try {
      const result = await client.resetConversation();
      if (result.ok) {
        clearMessages(storyId);
      } else {
        addMessage('system', t('aiChat.clearFailed'));
      }
    } finally {
      setClearingChat(false);
    }
  }, [addMessage, clearMessages, clearingChat, connectionState, storyId, t]);

  const handleClearLocalData = useCallback(() => {
    clearMessages(storyId);
  }, [clearMessages, storyId]);

  if (showSettings) return <AiSettingsPanel
    connectionState={connectionState}
    provider={provider}
    preferredProvider={aiBridgeSettings.preferredProvider}
    reason={connectionReason}
    token={aiBridgeSettings.token}
    url={aiBridgeSettings.url || bridgeConfig.url}
    permissions={normalizeAiPermissions(settings.aiPermissions)}
    capabilities={capabilities}
    requestedModel={aiBridgeSettings.requestedModel}
    requestedTokenBudget={aiBridgeSettings.requestedTokenBudget}
    colorScheme={colorScheme}
    onPermissionsChange={(aiPermissions) => updateSettings({ aiPermissions })}
    onConnect={handleConnect}
    onRetry={handleRetryConnection}
    onDisconnect={handleDisconnect}
    onResetConnection={handleResetConnection}
    onResetConversation={() => { void handleResetConversation(); }}
    onClearLocalData={handleClearLocalData}
    onClose={() => setShowSettings(false)}
    onApplyProviderSettings={(requestedModel, requestedTokenBudget) => {
      bridgeRef.current?.close();
      BridgeClient.clearPersistedSession(bridgeConfig.url);
      updateAiBridgeSettings({ requestedModel, requestedTokenBudget, disabled: false });
      setShowSettings(false);
      setRetryKey(value => value + 1);
    }}
  />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: connectionState === 'connected' ? colors.primary : colors.muted, fontSize: 11, fontWeight: '700' }}>
          {connectionState === 'demo' ? t('aiChat.connection.demo') : connectionState === 'connected' ? t('aiChat.connection.connected', { provider: provider === 'codex' ? 'Codex CLI · Beta' : provider === 'openai' ? 'OpenAI API' : provider === 'gemini' ? 'Google Gemini' : 'Claude Code' }) : connectionState === 'connecting' || connectionState === 'reconnecting' ? t('aiChat.connection.connecting') : t('aiChat.connection.error')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('aiChat.settings.open')} onPress={() => setShowSettings(true)}><Text style={{ color: colors.muted, fontSize: 15 }}>⚙</Text></Pressable>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
        {connectionState !== 'connected' ? (
          <ConnectionCard
            state={connectionState}
            token={aiBridgeSettings.token}
            url={aiBridgeSettings.url || bridgeConfig.url}
            provider={provider}
            preferredProvider={aiBridgeSettings.preferredProvider}
            reason={connectionReason}
            colorScheme={colorScheme}
            onConnect={handleConnect}
            onRetry={handleRetryConnection}
          />
        ) : null}
        {runtimeErrorReason ? (
          <View accessibilityRole="alert" style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 10 }}>
            <Text style={{ color: colors.danger, fontSize: 12 }}>
              {t(`aiChat.runtimeError.${runtimeErrorReason}`)}
            </Text>
          </View>
        ) : null}
        {imagePersistenceFailed ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12 }}>
            {t('aiChat.images.persistenceFailed')}
          </Text>
        ) : null}
        {messages.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>{t('aiChat.emptyState')}</Text>
        ) : null}
        {restored && messages.length > 0 ? <Text style={{ color: colors.muted, fontSize: 11 }}>{t('aiChat.restoredNote')}</Text> : null}

        {messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} text={message.text} attachments={message.attachments} colors={colors} importLabel={t('aiChat.attach.import')} unavailableLabel={t('aiChat.attach.unavailable')} onImport={async (attachment) => {
            if (attachment.assetId || attachment.kind !== 'image') return;
            const stored = await chatAttachmentRepository.get(attachment.id);
            if (!stored) return;
            const url = URL.createObjectURL(stored.blob);
            try {
              const asset = await addAssetToLibrary(url, attachment.name, 'image');
              useAppStore.getState().addImageAssetToStory(storyId, asset.id);
              await chatAttachmentRepository.put({ ...stored, assetId: asset.id });
              markAttachmentImported(storyId, attachment.id, asset.id);
            } finally { URL.revokeObjectURL(url); }
          }} />
        ))}

        {imageResults.map((result) => (
          <ImageResultCard
            key={result.requestId}
            result={result}
            storyId={storyId}
            colorScheme={colorScheme}
            onImported={async (assetId) => {
              await pendingImageRepository.delete(result.requestId);
              setImageResults((current) => current.map((item) =>
                item.requestId === result.requestId ? { ...item, assetId } : item));
            }}
            onDiscard={async () => {
              await pendingImageRepository.delete(result.requestId);
              imageResultIdsRef.current.delete(result.requestId);
              setImageResults((current) => current.filter((item) => item.requestId !== result.requestId));
            }}
          />
        ))}

        {status === 'thinking' ? (
          <Text style={{ color: colors.muted, fontSize: 12, fontStyle: 'italic' }}>{t('aiChat.thinking')}</Text>
        ) : null}

        {pendingPatch ? (
          <PatchPreviewCard
            description={pendingPatch.description}
            explanation={pendingPatch.patch.explanation}
            colorScheme={colorScheme}
            applying={applying}
            onApply={handleApply}
            onReject={handleReject}
          />
        ) : null}

        {pendingAppearance ? (
          <AppearancePreviewCard
            description={pendingAppearance.description}
            explanation={pendingAppearance.patch.explanation}
            colorScheme={colorScheme}
            applying={applying}
            onApply={handleApplyAppearance}
            onReject={handleRejectAppearance}
          />
        ) : null}

        {pendingChangeSet ? (
          <ChangeSetPreviewCard
            description={pendingChangeSet.description}
            explanation={pendingChangeSet.changeSet.explanation}
            colorScheme={colorScheme}
            applying={applying}
            onApply={handleApplyChangeSet}
            onReject={handleRejectChangeSet}
          />
        ) : null}

        {pendingCapability ? <CapabilityConfirmChip capability={pendingCapability.capability} estimate={pendingCapability.estimate} colorScheme={colorScheme} onAccept={() => resolveCapabilityDecision(true)} onDecline={() => resolveCapabilityDecision(false)} /> : null}

        {lastAppliedChange ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleRollback}
            style={{
              alignSelf: 'flex-start',
              minHeight: 32,
              paddingHorizontal: 12,
              justifyContent: 'center',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.primary,
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{t('aiChat.rollback')}</Text>
          </Pressable>
        ) : null}
        {confirmUndo ? (
          <View accessibilityRole="alert" style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 10, gap: 8 }}>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>{t('aiChat.rollbackConfirm')}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmUndo(false)}>
                <Text style={{ color: colors.muted, fontWeight: '700' }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={handleForceRollback}>
                <Text style={{ color: colors.danger, fontWeight: '700' }}>{t('aiChat.rollbackForce')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View
        ref={composerRef}
        style={{
          borderTopWidth: 1,
          borderTopColor: attachmentDropActive ? colors.primary : colors.border,
          backgroundColor: attachmentDropActive ? `${colors.primary}12` : 'transparent',
          paddingVertical: 8,
        }}
      >
        {attachmentDropActive ? (
          <Text accessibilityRole="alert" style={{ color: colors.primary, paddingHorizontal: 10, paddingBottom: 6, fontSize: 12, fontWeight: '700' }}>
            {t('aiChat.attach.drop')}
          </Text>
        ) : null}
        {draftAttachments.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 7, gap: 8 }}>
            {draftAttachments.map(item => (
              <DraftAttachmentCard
                key={item.id}
                attachment={item}
                colors={colors}
                removeLabel={t('aiChat.attach.remove', { name: item.name })}
                onRemove={() => {
                  void chatAttachmentRepository.delete(item.id);
                  setDraftAttachments(current => current.filter(value => value.id !== item.id));
                  setAttachmentError(undefined);
                }}
              />
            ))}
          </ScrollView>
        ) : null}
        {attachmentError ? <Text accessibilityRole="alert" style={{ color: colors.danger, paddingHorizontal: 10, paddingBottom: 5, fontSize: 11 }}>{attachmentError}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('aiChat.attach.button')}
            accessibilityHint={attachmentHelp}
            onPress={handleAttachmentButton}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: canAttach ? colors.primary : colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canAttach ? 1 : 0.72,
            }}
          >
            <Text style={{ color: canAttach ? colors.primary : colors.muted, fontSize: 18 }}>📎</Text>
          </Pressable>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('aiChat.inputPlaceholder')}
            placeholderTextColor={colors.muted}
            editable={status === 'idle'}
            multiline
            onSubmitEditing={handleSend}
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 120,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 11,
              paddingVertical: 9,
              color: colors.foreground,
            }}
          />
          {status === 'thinking' || status === 'interrupting' ? (
            <Pressable
              accessibilityRole="button"
              disabled={status === 'interrupting'}
              onPress={handleStop}
              style={{
                minWidth: 76,
                minHeight: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.danger,
                opacity: status === 'interrupting' ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>
                {t('aiChat.stop')}
              </Text>
            </Pressable>
          ) : <Pressable
            accessibilityRole="button"
            disabled={!canSend}
            onPress={handleSend}
            style={{
              minWidth: 76,
              minHeight: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              backgroundColor: colors.primary,
              opacity: canSend ? 1 : 0.5,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{t('aiChat.send')}</Text>
          </Pressable>}
        </View>
        <Text style={{ color: canAttach ? colors.muted : colors.danger, paddingHorizontal: 58, paddingTop: 5, fontSize: 10 }}>
          {attachmentHelp}
        </Text>
      </View>
    </View>
  );
}

function DraftAttachmentCard({
  attachment,
  colors,
  removeLabel,
  onRemove,
}: {
  attachment: StoredChatAttachment;
  colors: ReturnType<typeof useColors>;
  removeLabel: string;
  onRemove(): void;
}) {
  const [previewUri, setPreviewUri] = useState<string>();
  useEffect(() => {
    if (attachment.kind !== 'image' || typeof URL === 'undefined') return;
    const uri = URL.createObjectURL(attachment.blob);
    setPreviewUri(uri);
    return () => URL.revokeObjectURL(uri);
  }, [attachment.blob, attachment.kind]);
  const kindLabel = attachment.kind === 'image' ? 'IMG' : attachment.kind === 'pdf' ? 'PDF' : 'TXT';
  return (
    <View style={{ width: 176, minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 6, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      {previewUri ? (
        <Image source={{ uri: previewUri }} resizeMode="cover" style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: colors.border }} />
      ) : (
        <View style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '800' }}>{kindLabel}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: '700' }}>{attachment.name}</Text>
        <Text style={{ color: colors.muted, fontSize: 10 }}>{Math.ceil(attachment.byteSize / 1024)} KB</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={removeLabel} onPress={onRemove} style={{ alignSelf: 'flex-start', paddingHorizontal: 3 }}>
        <Text style={{ color: colors.danger, fontSize: 16 }}>×</Text>
      </Pressable>
    </View>
  );
}

function MessageBubble({
  role,
  text,
  attachments,
  onImport,
  importLabel,
  unavailableLabel,
  colors,
}: {
  role: AiChatRole;
  text: string;
  attachments?: AttachmentRef[];
  onImport?: (attachment: AttachmentRef) => void | Promise<void>;
  importLabel: string;
  unavailableLabel: string;
  colors: ReturnType<typeof useColors>;
}) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '90%',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: isUser ? colors.primary : isSystem ? colors.background : colors.surface,
        borderWidth: isSystem ? 1 : 0,
        borderColor: colors.border,
        borderStyle: isSystem ? 'dashed' : 'solid',
      }}
    >
      {attachments?.map(attachment => <AttachmentLine key={attachment.id} attachment={attachment} isUser={isUser} colors={colors} importLabel={importLabel} unavailableLabel={unavailableLabel} onImport={onImport} />)}
      {role === 'assistant'
        ? <MarkdownText text={text} color={colors.foreground} />
        : <Text style={{ color: isUser ? '#ffffff' : colors.foreground, fontSize: 13, lineHeight: 18 }}>{text}</Text>}
    </View>
  );
}

function AttachmentLine({ attachment, isUser, colors, importLabel, unavailableLabel, onImport }: { attachment: AttachmentRef; isUser: boolean; colors: ReturnType<typeof useColors>; importLabel: string; unavailableLabel: string; onImport?: (attachment: AttachmentRef) => void | Promise<void> }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => { let active = true; void chatAttachmentRepository.get(attachment.id).then(value => { if (active) setAvailable(!!value); }); return () => { active = false; }; }, [attachment.id]);
  return <View><Text style={{ color: isUser ? '#ffffff' : colors.foreground, fontSize: 11, fontWeight: '700' }}>📎 {attachment.name} · {Math.ceil(attachment.byteSize / 1024)} KB</Text>{available === false ? <Text style={{ color: isUser ? '#ffffff' : colors.muted, fontSize: 10 }}>{unavailableLabel}</Text> : attachment.kind === 'image' && !attachment.assetId && onImport ? <Pressable accessibilityRole="button" onPress={() => { void onImport(attachment); }}><Text style={{ color: isUser ? '#ffffff' : colors.primary, fontSize: 11, textDecorationLine: 'underline' }}>{importLabel}</Text></Pressable> : null}</View>;
}
