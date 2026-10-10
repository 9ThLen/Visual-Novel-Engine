/**
 * The assistant's session, held above the chat panel.
 *
 * Everything the chat does that is not drawing — the bridge client, the cards
 * waiting for the author, applying and undoing changes, sending — lives in the
 * hook below. `AiChatPanel` is the view of it.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { useI18n } from '@/hooks/use-i18n';
import { respond } from '@/lib/ai/fake-agent';
import { applyAiScenePatchToStore, rollbackAiPatch } from '@/lib/ai/scene-patch-adapter';
import { describeAiScenePatch, validateAiScenePatch } from '@/lib/ai/scene-patch';
import { applyAiAppearancePatchToStore, rollbackAiAppearancePatch } from '@/lib/ai/appearance-patch-adapter';
import { rollbackTopAppliedChange } from '@/lib/ai/applied-change-journal';
import { applyAiChangeSetToStore } from '@/lib/ai/change-set-adapter';
import {
  describeAiAppearancePatch,
  validateAiAppearancePatch,
} from '@/lib/ai/appearance-patch';
import {
  decodeImageResult,
  blobToBase64,
  downscaleImage,
  fromPendingAiImage,
  toPendingAiImage,
  type AiImageResult,
} from '@/lib/ai/image-tools';
import { pendingImageRepository } from '@/lib/ai/pending-image-storage';
import { chatAttachmentRepository } from '@/lib/ai/attachment-storage';
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
import { normalizeAiPermissions, resolveEffectiveCapability, type AiCapability } from '@/lib/ai/permissions';
import { isWriteRefusal, type WriteGate } from '@/lib/ai/write-gate';
import { createAppToolExecutor, refusalReason } from '@/lib/ai/app-tool-executor';
import { resolveAiBridgeConfig, selectAiBridgeProvider, updateActiveAiBridgeProfile } from '@/lib/ai/bridge-config';
import { aiProviderLabel, isBridgeProvider } from '@/lib/ai/providers';
import { buildAiStoryContext } from '@/lib/ai/story-context';
import type { AiEditorContext } from '@/lib/ai/editor-context';
import {
  buildEditorContextFromCapture,
  describeEditorContextPointer,
  focusBlockNameKey,
  type CaptureEditorContext,
  type EditorContextCapture,
} from '@/lib/ai/editor-context-capture';
import { generateId } from '@/lib/id-utils';
import { buildPatchProjectContext } from '@/lib/ai/project-context';
import { BridgeClient, type BridgeConnectionState, type BridgeProvider } from '@/lib/bridge-client';
import type { BridgeCapabilities } from '@/lib/bridge-protocol';
import { useAppStore } from '@/stores/use-app-store';
import {
  useAiChatStore,
  type AiChatPendingCapability,
  type AiChatPendingChangeSet,
  type AiChatRole,
} from '@/stores/ai-chat-store';

const EMPTY_AI_BRIDGE_SETTINGS = { url: '', token: '', disabled: false } as const;


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
  | 'ANTHROPIC_API_AUTH_FAILED'
  | 'ANTHROPIC_API_FORBIDDEN'
  | 'ANTHROPIC_RATE_LIMITED'
  | 'ANTHROPIC_MODEL_UNAVAILABLE'
  | 'ANTHROPIC_API_TIMEOUT'
  | 'ANTHROPIC_RESPONSE_INCOMPLETE'
  | 'ANTHROPIC_MALFORMED_RESPONSE'
  | 'ANTHROPIC_REFUSAL'
  | 'ANTHROPIC_STREAM_TOO_LARGE'
  | 'ANTHROPIC_STREAM_EVENT_TOO_LARGE'
  | 'ANTHROPIC_STREAM_INCOMPLETE'
  | 'ANTHROPIC_API_FAILED'
  | 'ANTHROPIC_ROUND_LIMIT'
  | 'ANTHROPIC_MALFORMED_FUNCTION_CALL'
  | 'ANTHROPIC_REQUEST_TOO_LARGE'
  | 'ANTHROPIC_SESSION_BUDGET_EXHAUSTED'
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
  'ANTHROPIC_API_AUTH_FAILED', 'ANTHROPIC_API_FORBIDDEN', 'ANTHROPIC_RATE_LIMITED',
  'ANTHROPIC_MODEL_UNAVAILABLE', 'ANTHROPIC_API_TIMEOUT', 'ANTHROPIC_RESPONSE_INCOMPLETE',
  'ANTHROPIC_MALFORMED_RESPONSE', 'ANTHROPIC_REFUSAL', 'ANTHROPIC_STREAM_TOO_LARGE',
  'ANTHROPIC_STREAM_EVENT_TOO_LARGE', 'ANTHROPIC_STREAM_INCOMPLETE', 'ANTHROPIC_API_FAILED',
  'ANTHROPIC_ROUND_LIMIT', 'ANTHROPIC_MALFORMED_FUNCTION_CALL', 'ANTHROPIC_REQUEST_TOO_LARGE',
  'ANTHROPIC_SESSION_BUDGET_EXHAUSTED',
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

interface AiInteraction {
  /** The capability was narrowed for this call because the turn carries untrusted attachments. */
  untrusted: boolean;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  ended: 'cancelled' | 'expired' | null;
}

export interface AiBridgeSessionProps {
  storyId: string;
  activeSceneId: string | null;
  /**
   * Save barrier: lands the document editor's draft in the store and reports
   * whether it got there. Every AI mutation goes through it first — the
   * revision guards compare against the store, so an unsaved draft turns all of
   * them into false negatives.
   */
  beforeStoryMutation: () => Promise<boolean>;
  /**
   * Reads the open scene and the author's selection in one pass, saving first
   * when asked to. Absent where there is no editor to read.
   */
  captureEditorContext?: CaptureEditorContext;
  /**
   * Start at once instead of waiting for the chat to be opened. A session held
   * by the editor waits: where the chat is never shown — the phone layout,
   * focus mode — there is nobody to decide on what the assistant proposes.
   */
  startOnMount?: boolean;
}

function useAiBridgeSessionState({ storyId, activeSceneId, beforeStoryMutation, captureEditorContext, startOnMount }: AiBridgeSessionProps) {
  const [started, setStarted] = useState(startOnMount === true);
  const start = useCallback(() => setStarted(true), []);
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
  const addMessage = useCallback((role: AiChatRole, text: string, attachments?: AttachmentRef[], contextLabel?: string) => addMessageToStore(role, text, storyId, attachments, contextLabel), [addMessageToStore, storyId]);
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
    ?? EMPTY_AI_BRIDGE_SETTINGS;
  const updateAiBridgeSettings = useAppStore((s) => s.updateAiBridgeSettings);
  const settings = useAppStore((s) => s.settings);
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const bridgeConfig = resolveAiBridgeConfig(aiBridgeSettings);

  const [inputText, setInputText] = useState('');
  const [applying, setApplying] = useState(false);
  const [connectionState, setConnectionState] = useState<'demo' | BridgeConnectionState>(bridgeConfig.enabled ? 'connecting' : 'demo');
  const [connectionReason, setConnectionReason] = useState<string>();
  const [connectionRetryable, setConnectionRetryable] = useState(true);
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
  const [pendingProviderSwitch, setPendingProviderSwitch] = useState<BridgeProvider>();
  const bridgeRef = useRef<BridgeClient | null>(null);
  const attachmentAddingRef = useRef(false);
  const activeSceneIdRef = useRef(activeSceneId);
  const imageResultIdsRef = useRef(new Set<string>());
  const assistantTextRef = useRef('');
  const patchDecisionRef = useRef<((value: unknown) => void) | null>(null);
  /**
   * Bridge calls that are waiting on the author or on a change being written.
   * The bridge can withdraw one, and one with a lifetime stops being valid when
   * it is up; after either, nothing more is written for it.
   */
  const interactionsRef = useRef(new Map<string, AiInteraction>());
  /** The call the card on screen belongs to. */
  const cardCallIdRef = useRef<string | null>(null);
  /** Set synchronously on click so a second click cannot enter while the save barrier is awaited. */
  const mutationInFlightRef = useRef(false);
  /**
   * Serialises every story mutation, including the ones with no button behind
   * them: the bridge dispatches tool calls without awaiting the previous one
   * (`void this.handleToolCall(...)`), so two auto-applied patches can both
   * clear their revision check and the second then overwrites the first.
   */
  const mutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  /** Forgets a call that is over; with no id, the one behind the card on screen. */
  const settleInteraction = useCallback((toolCallId: string | null = cardCallIdRef.current) => {
    if (!toolCallId) return;
    const interaction = interactionsRef.current.get(toolCallId);
    if (interaction?.timer) clearTimeout(interaction.timer);
    interactionsRef.current.delete(toolCallId);
    if (cardCallIdRef.current === toolCallId) cardCallIdRef.current = null;
  }, []);

  /** A call was withdrawn or ran out of time: nothing more is written for it, and its card goes. */
  const endInteraction = useCallback((toolCallId: string, how: 'cancelled' | 'expired') => {
    const interaction = interactionsRef.current.get(toolCallId);
    if (!interaction || interaction.ended) return;
    interaction.ended = how;
    // With a write on its way, the gate in front of that write stops it and
    // its handler takes the card down. Without a card there is nothing to take down.
    if (cardCallIdRef.current !== toolCallId || mutationInFlightRef.current) return;
    patchDecisionRef.current?.({ accepted: false, allowed: false, reason: how });
    patchDecisionRef.current = null;
    settleInteraction(toolCallId);
    cancelPendingInteraction(storyId);
    addMessage('system', t(how === 'expired' ? 'aiChat.proposalExpired' : 'aiChat.proposalWithdrawn'));
  }, [addMessage, cancelPendingInteraction, settleInteraction, storyId, t]);

  const beginInteraction = useCallback((toolCallId: string, ttlMs: number | undefined, untrusted: boolean, card: boolean) => {
    if (card) settleInteraction();
    interactionsRef.current.set(toolCallId, {
      untrusted,
      ended: null,
      expiresAt: ttlMs === undefined ? Number.POSITIVE_INFINITY : Date.now() + ttlMs,
      timer: ttlMs === undefined ? null : setTimeout(() => endInteraction(toolCallId, 'expired'), ttlMs),
    });
    if (card) cardCallIdRef.current = toolCallId;
  }, [endInteraction, settleInteraction]);

  /**
   * What an adapter asks in the step that writes: is the call behind this
   * change still alive, and is this kind of change still allowed.
   */
  const writeGate = useCallback((toolCallId: string | null, capability: AiCapability): WriteGate => () => {
    const interaction = toolCallId ? interactionsRef.current.get(toolCallId) : undefined;
    if (interaction?.ended) return interaction.ended === 'expired' ? 'EXPIRED' : 'CANCELLED';
    if (interaction && Date.now() >= interaction.expiresAt) return 'EXPIRED';
    const permissions = normalizeAiPermissions(useAppStore.getState().settings.aiPermissions);
    return resolveEffectiveCapability(capability, permissions, interaction?.untrusted === true) === 'blocked' ? 'PERMISSION_DENIED' : null;
  }, []);

  const refusalMessage = useCallback((refusal: 'CANCELLED' | 'EXPIRED' | 'PERMISSION_DENIED') => t(
    refusal === 'EXPIRED' ? 'aiChat.proposalExpired' : refusal === 'CANCELLED' ? 'aiChat.proposalWithdrawn' : 'aiChat.applyBlocked',
  ), [t]);

  /**
   * The bridge effect below owns the tool handlers and must not re-run when the
   * editor's save callback changes identity — that would reconnect the bridge
   * mid-conversation. Reading the barrier through a ref keeps it current
   * without entering that effect's dependency list.
   */
  const passesSaveBarrierRef = useRef<() => Promise<boolean>>(async () => true);
  /** Read through a ref for the same reason as the save barrier above. */
  const captureEditorContextRef = useRef(captureEditorContext);
  captureEditorContextRef.current = captureEditorContext;
  /** Set synchronously on send, so a second press cannot start a second capture while the first is awaited. */
  const sendInFlightRef = useRef(false);
  /**
   * The context that went out with the message of the turn in progress. The
   * model reads it back with `get_editor_context`; it is dropped when the turn
   * ends, and stops being offered once its scene has changed.
   */
  const turnEditorContextRef = useRef<AiEditorContext | null>(null);
  const enqueueMutationRef = useRef<<T>(task: () => Promise<T>) => Promise<T>>((task) => task());

  useEffect(() => { if (started) setActiveStory(storyId); }, [setActiveStory, started, storyId]);
  useEffect(() => { activeSceneIdRef.current = activeSceneId; }, [activeSceneId]);

  /** Pairs what the editor captured with the stored scene; the store is read now, after any save the capture made. */
  const buildEditorContext = useCallback((capture: EditorContextCapture, kind: AiEditorContext['kind']): AiEditorContext => {
    const state = useAppStore.getState();
    return buildEditorContextFromCapture({
      storyId,
      capture,
      kind,
      scene: state.sceneRecordsByStory[storyId]?.[capture.sceneId] ?? null,
      characters: state.characterLibraries[storyId] ?? [],
      snapshotId: generateId('ctx'),
      capturedAt: Date.now(),
    });
  }, [storyId]);

  /** A few words for the transcript; the context itself is not kept there. */
  const describeContextForTranscript = useCallback((context: AiEditorContext | null): string | undefined => {
    if (!context) return undefined;
    const pointer = describeEditorContextPointer(context);
    if (pointer.kind === 'none') return undefined;
    const place = context.scene ? t('aiChat.context.inScene', { scene: context.scene.name }) : '';
    const what = pointer.kind === 'selection'
      ? `«${pointer.quote}»`
      : t('aiChat.context.block', { name: t(focusBlockNameKey(pointer.blockType)) });
    return [what, place, pointer.exact ? '' : `· ${t('aiChat.context.inexact')}`].filter(Boolean).join(' ');
  }, [t]);
  useEffect(() => {
    if (!started) return;
    let active = true;
    void pendingImageRepository.listForStory(storyId).then((images) => {
      if (!active) return;
      imageResultIdsRef.current = new Set(images.map((image) => image.requestId));
      setImageResults(images.map(fromPendingAiImage));
    }).catch(() => {
      if (active) setRuntimeErrorReason('PROVIDER_ERROR');
    });
    return () => { active = false; };
  }, [started, storyId]);
  useEffect(() => {
    if (!started || !storiesMetadata.length) return;
    void pendingImageRepository.cleanup({
      existingStoryIds: new Set(storiesMetadata.map((story) => story.id)),
    }).catch(() => {
      // Cleanup is best-effort; delivery persistence reports its own failures.
    });
  }, [started, storiesMetadata]);

  useEffect(() => {
    if (!started) return;
    const token = bridgeConfig.token;
    const url = bridgeConfig.url;
    const enabled = bridgeConfig.enabled;
    if (!enabled || typeof WebSocket === 'undefined') {
      setConnectionState(aiBridgeSettings.disabled && aiBridgeSettings.token ? 'closed' : 'demo');
      return;
    }
    setConnectionState('connecting');
    setConnectionReason(undefined);
    setConnectionRetryable(true);
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
          settleInteraction();
          cancelPendingInteraction(storyId);
          setStatus('idle');
        }
      },
      onEvent: (message) => {
        const payload = typeof message.payload === 'object' && message.payload ? message.payload as Record<string, unknown> : {};
        if (message.type === 'session_started' && isBridgeProvider(payload.provider)) {
          setProvider(payload.provider);
          if (payload.capabilities && typeof payload.capabilities === 'object') setCapabilities(payload.capabilities as BridgeCapabilities);
        }
        if (message.type === 'session_challenge' && typeof payload.reason === 'string') {
          setConnectionReason(payload.reason);
          setConnectionRetryable(payload.retryable !== false);
          if (isBridgeProvider(payload.provider)) {
            setProvider(payload.provider);
          }
        }
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
          turnEditorContextRef.current = null;
          const chat = useAiChatStore.getState();
          setStatus(chat.pendingInteraction?.storyId === storyId ? 'awaiting_confirmation' : 'idle');
        }
        if (message.type === 'error') {
          turnEditorContextRef.current = null;
          setRuntimeErrorReason(resolveBridgeRuntimeError(payload));
          setStatus('idle');
        }
      },
      onToolCancel: toolCallId => endInteraction(toolCallId, 'cancelled'),
      onToolCall: createAppToolExecutor({
        storyId,
        getActiveSceneId: () => activeSceneIdRef.current,
        getCaptureEditorContext: () => captureEditorContextRef.current,
        buildEditorContext,
        getTurnEditorContext: () => turnEditorContextRef.current,
        dropTurnEditorContext: () => { turnEditorContextRef.current = null; },
        beginInteraction,
        settleInteraction,
        writeGate,
        showScenePatch: setPendingPatch,
        showAppearancePatch: setPendingAppearance,
        showChangeSet: setPendingChangeSet,
        showCapability: setPendingCapability,
        waitForDecision: () => new Promise((resolve) => { patchDecisionRef.current = resolve; }),
        enqueueMutation: task => enqueueMutationRef.current(task),
        passesSaveBarrier: () => passesSaveBarrierRef.current(),
        keepImageResult: async (result) => {
          const persisted = await pendingImageRepository.put(toPendingAiImage(result, storyId));
          URL.revokeObjectURL(result.blobUrl);
          imageResultIdsRef.current.add(persisted.requestId);
          setImageResults(current => current.some(item => item.requestId === persisted.requestId)
            ? current
            : [...current, fromPendingAiImage(persisted)]);
        },
      }),
    });
    bridgeRef.current = client;
    client.connect();
    return () => {
      patchDecisionRef.current?.({ accepted: false, allowed: false, reason: 'panel_closed' });
      patchDecisionRef.current = null;
      settleInteraction();
      cancelPendingInteraction(storyId);
      client.close();
      bridgeRef.current = null;
    };
  }, [storyId, bridgeConfig.enabled, bridgeConfig.url, bridgeConfig.token, bridgeConfig.preferredProvider, bridgeConfig.codexBetaConsent, bridgeConfig.requestedModel, bridgeConfig.requestedTokenBudget, aiBridgeSettings.disabled, aiBridgeSettings.token, language, retryKey, started, addMessage, beginInteraction, buildEditorContext, cancelPendingInteraction, endInteraction, setPendingPatch, setPendingAppearance, setPendingChangeSet, setPendingCapability, setStatus, settleInteraction, t, writeGate]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if ((!text && draftAttachments.length === 0) || status !== 'idle') return;
    if (bridgeRef.current && connectionState !== 'connected') return;

    // Before anything else: the capture reads the selection as it is now, and
    // saves the text it was made in, so the context names steps that exist.
    let editorContext: AiEditorContext | null = null;
    let turnSceneId = activeSceneId;
    if (captureEditorContext) {
      const outcome = await captureEditorContext({ save: true });
      if (!outcome.ok) {
        addMessage('system', t('aiChat.sendSaveFailed'));
        return;
      }
      editorContext = buildEditorContext(outcome.capture, 'fixed');
      turnSceneId = outcome.capture.sceneId;
    }

    const ctx = turnSceneId ? buildAiStoryContext(storyId, turnSceneId) : null;
    if (!ctx) {
      addMessage('assistant', t('aiChat.noActiveScene'));
      return;
    }
    const contextLabel = describeContextForTranscript(editorContext);

    if (bridgeRef.current) {
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
      const delivered = bridgeRef.current?.sendUserMessage(text, wireAttachments, editorContext) ?? { ok: false as const };
      if (!delivered.ok) {
        setInputText(text);
        setStatus('idle');
        setRuntimeErrorReason('PROVIDER_ERROR');
        return;
      }
      turnEditorContextRef.current = editorContext;
      setRuntimeErrorReason(undefined);
      setInputText('');
      const refs = draftAttachments.map(({ blob: _blob, storyId: _storyId, createdAt: _createdAt, messageId: _messageId, ...ref }) => ref);
      const message = addMessage('user', text, refs, contextLabel);
      await Promise.all(draftAttachments.map((attachment) => chatAttachmentRepository.put({ ...attachment, messageId: message.id })));
      setDraftAttachments([]);
      setStatus('thinking');
      return;
    }
    setRuntimeErrorReason(undefined);
    setInputText('');
    addMessage('user', text, undefined, contextLabel);
    setStatus('thinking');
    const response = await respond(text, ctx, editorContext);

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
  }, [inputText, draftAttachments, status, activeSceneId, storyId, addMessage, buildEditorContext, captureEditorContext, describeContextForTranscript, setStatus, setPendingPatch, setPendingAppearance, t, connectionState]);

  /**
   * Sending is one operation. The guard is a ref because the capture is
   * awaited before any state changes: with `status` alone the button stays
   * live for that whole wait and a second press would send the message twice.
   */
  const handleSend = useCallback(async () => {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    try {
      await sendMessage();
    } finally {
      sendInFlightRef.current = false;
    }
  }, [sendMessage]);

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


  /**
   * Runs before every mutation. On failure the caller must abort: mutating on
   * top of an unsaved draft would compare revisions against a story state the
   * author has already moved past, and the editor's next save would write the
   * stale document back over the result.
   */
  const passesSaveBarrier = useCallback(async (): Promise<boolean> => {
    const saved = await beforeStoryMutation();
    if (!saved) addMessage('system', t('aiChat.saveBarrierFailed'));
    return saved;
  }, [addMessage, beforeStoryMutation, t]);

  const enqueueMutation = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = mutationQueueRef.current.then(task, task);
    // The queue must survive a failed task, so its own chain swallows results.
    mutationQueueRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  passesSaveBarrierRef.current = passesSaveBarrier;
  enqueueMutationRef.current = enqueueMutation;

  /**
   * Serialises story mutations. The guard is a ref, not `applying` state,
   * because the barrier is awaited before any state update lands: with a state
   * flag the button stays live for the whole flush and a second click would run
   * the same patch again.
   */
  const runStoryMutation = useCallback(async (mutate: () => Promise<void>): Promise<void> => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    // Disable the decision buttons before the first await: until this lands,
    // Reject is still live and would resolve the decision while the barrier is
    // running, after which the mutation would apply anyway.
    setApplying(true);
    try {
      await enqueueMutation(async () => {
        if (!(await passesSaveBarrier())) return;
        await mutate();
      });
    } finally {
      mutationInFlightRef.current = false;
      setApplying(false);
    }
  }, [enqueueMutation, passesSaveBarrier]);

  const handleApply = useCallback(async () => {
    if (!pendingPatch) return;
    await runStoryMutation(async () => {
      try {
        const result = await applyAiScenePatchToStore(pendingPatch.patch, writeGate(cardCallIdRef.current, 'scene_edit'));
        if (result.ok) {
          addMessage('system', t('aiChat.applySuccess'));
          patchDecisionRef.current?.({ accepted: true });
        } else {
          const message = isWriteRefusal(result.code)
            ? refusalMessage(result.code)
            : result.code === 'STALE_REVISION'
              ? t('aiChat.applyFailedStale')
              : result.code === 'VALIDATION_FAILED'
                ? t('aiChat.applyFailedValidation', { errors: result.errors.join('; ') })
                : t('aiChat.applyFailedGeneric');
          addMessage('system', message);
          patchDecisionRef.current?.({ accepted: false, reason: refusalReason(result.code) });
        }
      } finally {
        setPendingPatch(null);
        patchDecisionRef.current = null;
        settleInteraction();
      }
    });
  }, [pendingPatch, addMessage, refusalMessage, runStoryMutation, setPendingPatch, settleInteraction, t, writeGate]);

  const handleReject = useCallback(() => {
    if (mutationInFlightRef.current) return;
    setPendingPatch(null);
    addMessage('system', t('aiChat.rejected'));
    patchDecisionRef.current?.({ accepted: false, reason: 'rejected' });
    patchDecisionRef.current = null;
    settleInteraction();
  }, [addMessage, setPendingPatch, settleInteraction, t]);

  const handleApplyAppearance = useCallback(async () => {
    if (!pendingAppearance) return;
    setApplying(true);
    try {
      const result = await applyAiAppearancePatchToStore(pendingAppearance.patch, writeGate(cardCallIdRef.current, 'appearance'));
      if (result.ok) {
        addMessage('system', t('aiChat.applySuccess'));
        patchDecisionRef.current?.({ accepted: true });
      } else {
        const message = isWriteRefusal(result.code)
          ? refusalMessage(result.code)
          : result.code === 'STALE_REVISION'
            ? t('aiChat.applyFailedStale')
            : result.code === 'VALIDATION_FAILED'
              ? t('aiChat.applyFailedValidation', { errors: result.errors.join('; ') })
              : t('aiChat.applyFailedGeneric');
        addMessage('system', message);
        patchDecisionRef.current?.({ accepted: false, reason: refusalReason(result.code) });
      }
    } finally {
      setApplying(false);
      setPendingAppearance(null);
      patchDecisionRef.current = null;
      settleInteraction();
    }
  }, [pendingAppearance, addMessage, refusalMessage, setPendingAppearance, settleInteraction, t, writeGate]);

  const handleRejectAppearance = useCallback(() => {
    if (mutationInFlightRef.current) return;
    setPendingAppearance(null);
    addMessage('system', t('aiChat.rejected'));
    patchDecisionRef.current?.({ accepted: false, reason: 'rejected' });
    patchDecisionRef.current = null;
    settleInteraction();
  }, [addMessage, setPendingAppearance, settleInteraction, t]);

  const handleApplyChangeSet = useCallback(async () => {
    if (!pendingChangeSet) return;
    await runStoryMutation(async () => {
      try {
        const result = await applyAiChangeSetToStore(pendingChangeSet.changeSet, writeGate(cardCallIdRef.current, 'changeset'));
        if (result.ok) {
          addMessage('system', t('aiChat.applySuccess'));
          patchDecisionRef.current?.({ accepted: true, summary: pendingChangeSet.description });
        } else {
          addMessage('system', isWriteRefusal(result.code)
            ? refusalMessage(result.code)
            : result.code === 'STALE_REVISION' ? t('aiChat.applyFailedStale') : t('aiChat.applyFailedValidation', { errors: result.message }));
          patchDecisionRef.current?.({ accepted: false, reason: refusalReason(result.code) });
        }
      } finally {
        setPendingChangeSet(null);
        patchDecisionRef.current = null;
        settleInteraction();
      }
    });
  }, [pendingChangeSet, addMessage, refusalMessage, runStoryMutation, setPendingChangeSet, settleInteraction, t, writeGate]);

  const handleRejectChangeSet = useCallback(() => {
    if (mutationInFlightRef.current) return;
    setPendingChangeSet(null);
    addMessage('system', t('aiChat.rejected'));
    patchDecisionRef.current?.({ accepted: false, reason: 'rejected' });
    patchDecisionRef.current = null;
    settleInteraction();
  }, [addMessage, setPendingChangeSet, settleInteraction, t]);

  const handleRollback = useCallback(async () => {
    if (!lastAppliedChange) return;
    await runStoryMutation(async () => {
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
    });
  }, [lastAppliedChange, addMessage, runStoryMutation, setLastAppliedChange, storyId, t]);

  const handleForceRollback = useCallback(async () => {
    // The barrier runs again: the author could have typed between the first
    // refusal and this confirmation, and that draft must land before the
    // snapshot restore overwrites the story.
    await runStoryMutation(async () => {
        const result = await rollbackTopAppliedChange(storyId, true);
        setConfirmUndo(false);
        addMessage('system', result.ok ? t('aiChat.rollbackSuccess') : t('aiChat.rollbackFailed'));
    });
  }, [addMessage, runStoryMutation, storyId, t]);

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
    settleInteraction();
    setPendingCapability(null);
  }, [setPendingCapability, settleInteraction]);

  const handleConnect = useCallback((token: string, url: string, preferredProvider: BridgeProvider) => {
    setProvider(undefined);
    setConnectionReason(undefined);
    const selected = selectAiBridgeProvider(aiBridgeSettings, preferredProvider);
    updateAiBridgeSettings(updateActiveAiBridgeProfile({ ...selected, disabled: false }, { token, url }));
    setRetryKey(value => value + 1);
  }, [aiBridgeSettings, updateAiBridgeSettings]);

  const applyProviderSwitch = useCallback((nextProvider: BridgeProvider) => {
    const previousProvider = aiBridgeSettings.preferredProvider ?? 'openai';
    if (nextProvider === previousProvider && nextProvider === aiBridgeSettings.preferredProvider) return;
    bridgeRef.current?.close();
    setProvider(undefined);
    setCapabilities(undefined);
    setConnectionReason(undefined);
    setConnectionRetryable(true);
    updateAiBridgeSettings(selectAiBridgeProvider(aiBridgeSettings, nextProvider));
    if (connectionState === 'connected') {
      addMessage('system', t('aiChat.providerChanged', {
        from: aiProviderLabel(previousProvider),
        to: aiProviderLabel(nextProvider),
      }));
    }
    setRetryKey(value => value + 1);
  }, [addMessage, aiBridgeSettings, connectionState, t, updateAiBridgeSettings]);

  const handleProviderChange = useCallback((nextProvider: BridgeProvider) => {
    if (nextProvider === (aiBridgeSettings.preferredProvider ?? 'openai')) return;
    if (status !== 'idle' || (pendingInteraction?.storyId === storyId)) {
      setShowSettings(false);
      setPendingProviderSwitch(nextProvider);
      return;
    }
    applyProviderSwitch(nextProvider);
  }, [aiBridgeSettings.preferredProvider, applyProviderSwitch, pendingInteraction, status, storyId]);

  const handleRetryConnection = useCallback(() => {
    updateAiBridgeSettings({ disabled: false });
    setConnectionReason(undefined);
    setConnectionRetryable(true);
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
    updateAiBridgeSettings({ url: '', token: '', disabled: true, preferredProvider: 'openai', profiles: {}, requestedModel: undefined, requestedTokenBudget: undefined, codexBetaConsent: undefined });
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

  return {
    start,
    storyId,
    activeSceneId,
    captureEditorContext,
    t,
    language,
    messages,
    status,
    pendingInteraction,
    pendingPatch,
    pendingAppearance,
    pendingChangeSet,
    pendingCapability,
    lastAppliedChange,
    addMessageToStore,
    setActiveStory,
    clearMessages,
    markAttachmentImported,
    restored,
    addMessage,
    setStatus,
    setPendingInteraction,
    cancelPendingInteraction,
    setPendingPatch,
    setPendingAppearance,
    setPendingChangeSet,
    setPendingCapability,
    setLastAppliedChange,
    aiBridgeSettings,
    updateAiBridgeSettings,
    settings,
    storiesMetadata,
    updateSettings,
    bridgeConfig,
    inputText,
    setInputText,
    applying,
    setApplying,
    connectionState,
    setConnectionState,
    connectionReason,
    setConnectionReason,
    connectionRetryable,
    setConnectionRetryable,
    provider,
    setProvider,
    capabilities,
    setCapabilities,
    draftAttachments,
    setDraftAttachments,
    attachmentError,
    setAttachmentError,
    attachmentDropActive,
    setAttachmentDropActive,
    retryKey,
    setRetryKey,
    showSettings,
    setShowSettings,
    imageResults,
    setImageResults,
    runtimeErrorReason,
    setRuntimeErrorReason,
    clearingChat,
    setClearingChat,
    confirmUndo,
    setConfirmUndo,
    imagePersistenceFailed,
    setImagePersistenceFailed,
    pendingProviderSwitch,
    setPendingProviderSwitch,
    bridgeRef,
    attachmentAddingRef,
    activeSceneIdRef,
    imageResultIdsRef,
    assistantTextRef,
    patchDecisionRef,
    interactionsRef,
    cardCallIdRef,
    mutationInFlightRef,
    mutationQueueRef,
    settleInteraction,
    endInteraction,
    beginInteraction,
    writeGate,
    refusalMessage,
    passesSaveBarrierRef,
    captureEditorContextRef,
    sendInFlightRef,
    turnEditorContextRef,
    enqueueMutationRef,
    buildEditorContext,
    describeContextForTranscript,
    sendMessage,
    handleSend,
    addDraftFiles,
    handleAttach,
    attachmentsSupported,
    canAttach,
    attachmentHelp,
    handleAttachmentButton,
    passesSaveBarrier,
    enqueueMutation,
    runStoryMutation,
    handleApply,
    handleReject,
    handleApplyAppearance,
    handleRejectAppearance,
    handleApplyChangeSet,
    handleRejectChangeSet,
    handleRollback,
    handleForceRollback,
    canSend,
    handleStop,
    resolveCapabilityDecision,
    handleConnect,
    applyProviderSwitch,
    handleProviderChange,
    handleRetryConnection,
    handleDisconnect,
    handleResetConnection,
    handleResetConversation,
    handleClearLocalData,
  };
}

export type AiBridgeSession = ReturnType<typeof useAiBridgeSessionState>;

const AiBridgeSessionContext = createContext<AiBridgeSession | null>(null);

/**
 * Holds the assistant's session for one story: the socket, what it is waiting
 * for, the queue every change goes through.
 *
 * It used to live in the chat panel, and the panel goes away whenever the
 * author switches the rail to the inspector — taking the connection, and any
 * proposal still on screen, with it. Held here, above the rail, the session
 * lasts as long as the editor has the story open: a change of story ends it,
 * and leaving the editor turns down whatever was still waiting, as before.
 */
export function AiBridgeSessionProvider({ children, ...props }: AiBridgeSessionProps & { children: React.ReactNode }) {
  const session = useAiBridgeSessionState(props);
  return <AiBridgeSessionContext.Provider value={session}>{children}</AiBridgeSessionContext.Provider>;
}

/** The session above this component, or null where nothing holds one. */
export function useAiBridgeSession(): AiBridgeSession | null {
  return useContext(AiBridgeSessionContext);
}
