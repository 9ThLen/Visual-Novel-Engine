import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

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
  executeRemoveBackground,
  fromPendingAiImage,
  getStoryImageBinary,
  toPendingAiImage,
  type AiImageResult,
} from '@/lib/ai/image-tools';
import { pendingImageRepository } from '@/lib/ai/pending-image-storage.web';
import { APP_BRIDGE_TOOL_NAMES } from '@/lib/ai/bridge-tools';
import { AI_CAPABILITIES, resolveCapability, type AiCapability, type AiPermissions } from '@/lib/ai/permissions';
import { resolveAiBridgeConfig } from '@/lib/ai/bridge-config';
import { buildAiStoryContext } from '@/lib/ai/story-context';
import { getStoryImageAssets } from '@/lib/story-image-library';
import { BridgeClient, type BridgeConnectionState, type BridgeProvider } from '@/lib/bridge-client';
import { removeImageBackground } from '@/lib/remove-background.web';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import { useAppStore } from '@/stores/use-app-store';
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
import { AiPermissionSettings } from './AiPermissionSettings';
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
  | 'PROVIDER_ERROR';

const OPENAI_RUNTIME_REASONS = new Set<BridgeRuntimeErrorReason>([
  'OPENAI_API_AUTH_FAILED', 'OPENAI_API_FORBIDDEN', 'OPENAI_RATE_LIMITED', 'OPENAI_MODEL_UNAVAILABLE',
  'OPENAI_API_TIMEOUT', 'OPENAI_RESPONSE_INCOMPLETE', 'OPENAI_MALFORMED_RESPONSE', 'OPENAI_REFUSAL',
  'OPENAI_STREAM_TOO_LARGE', 'OPENAI_STREAM_EVENT_TOO_LARGE', 'OPENAI_STREAM_INCOMPLETE',
  'OPENAI_API_FAILED', 'OPENAI_ROUND_LIMIT', 'OPENAI_PARALLEL_TOOL_CALLS',
  'OPENAI_MALFORMED_FUNCTION_CALL', 'OPENAI_NON_REPLAYABLE_REASONING', 'OPENAI_REQUEST_TOO_LARGE',
  'OPENAI_SESSION_BUDGET_EXHAUSTED',
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
  const restored = useAiChatStore((s) => s.restoredStoryIds[storyId] === true);
  const addMessage = useCallback((role: AiChatRole, text: string) => addMessageToStore(role, text, storyId), [addMessageToStore, storyId]);
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
  const [retryKey, setRetryKey] = useState(0);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showConnectionMenu, setShowConnectionMenu] = useState(false);
  const [imageResults, setImageResults] = useState<AiImageResult[]>([]);
  const [runtimeErrorReason, setRuntimeErrorReason] = useState<BridgeRuntimeErrorReason>();
  const [clearingChat, setClearingChat] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [imagePersistenceFailed, setImagePersistenceFailed] = useState(false);
  const bridgeRef = useRef<BridgeClient | null>(null);
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
    const { token, url, enabled } = bridgeConfig;
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
        if (message.type === 'session_started' && (payload.provider === 'claude' || payload.provider === 'openai' || payload.provider === 'codex')) setProvider(payload.provider);
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
      onToolCall: async (_id, name, input) => {
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
          const permission = resolveCapability('image_generate', useAppStore.getState().settings.aiPermissions);
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
          const permission = resolveCapability('scene_edit', useAppStore.getState().settings.aiPermissions);
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
          const permission = resolveCapability('appearance', useAppStore.getState().settings.aiPermissions);
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
          if (resolveCapability('changeset', useAppStore.getState().settings.aiPermissions) === 'blocked') {
            return { ok: false, errorCode: 'PERMISSION_DENIED', errorMessage: 'Story changes are blocked', details: { reason: 'USER_BLOCKED' } };
          }
          return executeProposeChangeSet(storyId, input, setPendingChangeSet, () => new Promise(resolve => { patchDecisionRef.current = resolve; }));
        }
        if (name === 'authorize_capability') {
          return executeAuthorizeCapability(input, useAppStore.getState().settings.aiPermissions, setPendingCapability, () => new Promise(resolve => { patchDecisionRef.current = resolve as (value: unknown) => void; }));
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
  }, [storyId, bridgeConfig.enabled, bridgeConfig.url, bridgeConfig.token, aiBridgeSettings.disabled, aiBridgeSettings.token, language, retryKey, addMessage, setPendingPatch, setPendingAppearance, setPendingChangeSet, setPendingCapability, setStatus, t]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || status !== 'idle') return;
    const ctx = activeSceneId ? buildAiStoryContext(storyId, activeSceneId) : null;
    if (!ctx) {
      addMessage('assistant', t('aiChat.noActiveScene'));
      return;
    }

    if (bridgeRef.current) {
      if (connectionState !== 'connected') return;
      assistantTextRef.current = '';
      const delivered = bridgeRef.current.sendUserMessage(text);
      if (!delivered.ok) {
        setInputText(text);
        setStatus('idle');
        setRuntimeErrorReason('PROVIDER_ERROR');
        return;
      }
      setRuntimeErrorReason(undefined);
      setInputText('');
      addMessage('user', text);
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
  }, [inputText, status, activeSceneId, storyId, addMessage, setStatus, setPendingPatch, setPendingAppearance, t, connectionState]);

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
    && inputText.trim().length > 0
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
    setShowConnectionMenu(false);
  }, [aiBridgeSettings.token, aiBridgeSettings.url, bridgeConfig.token, bridgeConfig.url, updateAiBridgeSettings]);

  const handleResetConnection = useCallback(() => {
    bridgeRef.current?.close();
    BridgeClient.clearPersistedSession(bridgeConfig.url);
    updateAiBridgeSettings({ url: '', token: '', disabled: true, preferredProvider: 'openai', codexBetaConsent: undefined });
    setProvider(undefined);
    setConnectionReason(undefined);
    setConnectionState('demo');
    setShowConnectionMenu(false);
  }, [bridgeConfig.url, updateAiBridgeSettings]);

  const handleClearChat = useCallback(async () => {
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

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: connectionState === 'connected' ? colors.primary : colors.muted, fontSize: 11, fontWeight: '700' }}>
          {connectionState === 'demo' ? t('aiChat.connection.demo') : connectionState === 'connected' ? t('aiChat.connection.connected', { provider: provider === 'codex' ? 'Codex CLI · Beta' : provider === 'openai' ? 'OpenAI API' : 'Claude Code' }) : connectionState === 'connecting' || connectionState === 'reconnecting' ? t('aiChat.connection.connecting') : t('aiChat.connection.error')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {connectionState === 'connected' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('aiChat.connection.menu')} onPress={() => setShowConnectionMenu(value => !value)}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>⋯</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('aiChat.permissions.open')} onPress={() => setShowPermissions(value => !value)}><Text style={{ color: colors.muted, fontSize: 15 }}>⚙</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={clearingChat} onPress={handleClearChat}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{t('aiChat.clear')}</Text>
          </Pressable>
        </View>
      </View>
      {showConnectionMenu ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', gap: 14 }}>
          <Pressable accessibilityRole="button" onPress={handleDisconnect}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{t('aiChat.connection.disconnect')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={handleResetConnection}>
            <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>{t('aiChat.connection.reset')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setShowPermissions(true); setShowConnectionMenu(false); }}>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>{t('aiChat.permissions.title')}</Text>
          </Pressable>
        </View>
      ) : null}
      {showPermissions ? <AiPermissionSettings permissions={settings.aiPermissions} onChange={(aiPermissions) => updateSettings({ aiPermissions })} colorScheme={colorScheme} /> : null}
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
          <MessageBubble key={message.id} role={message.role} text={message.text} colors={colors} />
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

      <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('aiChat.inputPlaceholder')}
          placeholderTextColor={colors.muted}
          editable={status === 'idle'}
          onSubmitEditing={handleSend}
          style={{
            flex: 1,
            minHeight: 38,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            paddingHorizontal: 10,
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
              minHeight: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
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
            minHeight: 38,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            backgroundColor: colors.primary,
            opacity: canSend ? 1 : 0.5,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{t('aiChat.send')}</Text>
        </Pressable>}
      </View>
    </View>
  );
}

function MessageBubble({
  role,
  text,
  colors,
}: {
  role: AiChatRole;
  text: string;
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
      {role === 'assistant'
        ? <MarkdownText text={text} color={colors.foreground} />
        : <Text style={{ color: isUser ? '#ffffff' : colors.foreground, fontSize: 13, lineHeight: 18 }}>{text}</Text>}
    </View>
  );
}
