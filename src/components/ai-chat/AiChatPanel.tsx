import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import type { ColorScheme } from '@/constants/theme';
import {
  blobToBase64,
} from '@/lib/ai/image-tools';
import { pendingImageRepository } from '@/lib/ai/pending-image-storage';
import { applyImportedImagePlacement } from '@/lib/ai/image-placement';
import { chatAttachmentRepository } from '@/lib/ai/attachment-storage';
import {
  type AttachmentRef,
  type StoredChatAttachment,
} from '@/lib/ai/attachments';
import { normalizeAiPermissions } from '@/lib/ai/permissions';
import { aiProviderLabel } from '@/lib/ai/providers';
import {
  type CaptureEditorContext,
} from '@/lib/ai/editor-context-capture';
import { BridgeClient } from '@/lib/bridge-client';
import { useAppStore } from '@/stores/use-app-store';
import { addAssetToLibrary } from '@/stores/media-library-actions';
import {
  type AiChatRole,
} from '@/stores/ai-chat-store';
import { AppearancePreviewCard } from './AppearancePreviewCard';
import { PatchPreviewCard } from './PatchPreviewCard';
import { ChangeSetPreviewCard } from './ChangeSetPreviewCard';
import { ConnectionCard } from './ConnectionCard';
import { MarkdownText } from './MarkdownText';
import { AiSettingsPanel } from './AiSettingsPanel';
import { CapabilityConfirmChip } from './CapabilityConfirmChip';
import { EditorContextChip } from './EditorContextChip';
import { ImageResultCard } from './ImageResultCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AiBridgeSessionProvider, useAiBridgeSession, useIsInAiBridgeEditor, type AiBridgeSession } from './AiBridgeSessionProvider';

interface AiChatPanelProps {
  storyId: string;
  activeSceneId: string | null;
  colorScheme?: ColorScheme;
  /**
   * Save barrier: lands the document editor's draft in the store and reports
   * whether it got there. Every AI mutation goes through it first — the
   * revision guards below compare against the store, so an unsaved draft turns
   * all of them into false negatives.
   */
  beforeStoryMutation: () => Promise<boolean>;
  /**
   * Reads the open scene and the author's selection in one pass, saving first
   * when asked to. Absent where there is no editor to read; the chat then
   * works as it did before it knew about selections.
   */
  captureEditorContext?: CaptureEditorContext;
}

// Kept here for the callers that have always imported them from the panel.
export { executeAuthorizeCapability, executeProposeChangeSet } from '@/lib/ai/app-tool-executor';

/**
 * The chat: messages, the composer, the cards. What it shows and does comes
 * from the session — the editor's, when it is rendered inside one, so that
 * switching the rail away and back finds the conversation as it was. Rendered
 * on its own it holds a session itself, as it always has.
 */
export function AiChatPanel({ storyId, activeSceneId, colorScheme, beforeStoryMutation, captureEditorContext }: AiChatPanelProps) {
  const inEditor = useIsInAiBridgeEditor();
  if (inEditor) return <AiChatPanelOfSession colorScheme={colorScheme} />;
  return (
    <AiBridgeSessionProvider
      storyId={storyId}
      activeSceneId={activeSceneId}
      beforeStoryMutation={beforeStoryMutation}
      captureEditorContext={captureEditorContext}
      startOnMount
    >
      <AiChatPanelOfSession colorScheme={colorScheme} />
    </AiBridgeSessionProvider>
  );
}

/**
 * Draws the session, when this editor has it. An editor under another one does
 * not — the session is with the one in front — and nothing is drawn there.
 */
function AiChatPanelOfSession({ colorScheme }: { colorScheme?: ColorScheme }) {
  const session = useAiBridgeSession();
  return session ? <AiChatPanelView colorScheme={colorScheme} session={session} /> : null;
}

function AiChatPanelView({ colorScheme, session }: { colorScheme?: ColorScheme; session: AiBridgeSession }) {
  const colors = useColors(colorScheme);
  const {
    start,
    addDraftFiles,
    aiBridgeSettings,
    applyProviderSwitch,
    applying,
    attachmentDropActive,
    attachmentError,
    attachmentHelp,
    bridgeConfig,
    bridgeRef,
    canAttach,
    canSend,
    capabilities,
    captureEditorContext,
    confirmUndo,
    connectionReason,
    connectionRetryable,
    connectionState,
    draftAttachments,
    handleApply,
    handleApplyAppearance,
    handleApplyChangeSet,
    handleAttachmentButton,
    handleClearLocalData,
    handleConnect,
    handleDisconnect,
    handleForceRollback,
    handleProviderChange,
    handleReject,
    handleRejectAppearance,
    handleRejectChangeSet,
    handleResetConnection,
    handleResetConversation,
    handleRetryConnection,
    handleRollback,
    handleSend,
    handleStop,
    imagePersistenceFailed,
    imageResultIdsRef,
    imageResults,
    inputText,
    lastAppliedChange,
    markAttachmentImported,
    messages,
    mutationInFlightRef,
    pendingAppearance,
    pendingCapability,
    pendingChangeSet,
    pendingPatch,
    pendingFromExternalAgent,
    externalAgentAccess,
    pendingProviderSwitch,
    provider,
    resolveCapabilityDecision,
    restored,
    runtimeErrorReason,
    setAttachmentDropActive,
    setAttachmentError,
    setConfirmUndo,
    setDraftAttachments,
    setImageResults,
    setInputText,
    setPendingProviderSwitch,
    setRetryKey,
    setShowSettings,
    settings,
    showSettings,
    status,
    storyId,
    t,
    updateAiBridgeSettings,
    updateSettings,
  } = session;
  const composerRef = useRef<View | null>(null);

  // The session waits for the chat to be opened once; after that it stays up
  // whether or not this panel is on screen.
  useEffect(() => { start(); }, [start]);

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
  }, [addDraftFiles, attachmentHelp, canAttach, setAttachmentDropActive, setAttachmentError]);

  if (showSettings) return <AiSettingsPanel
    connectionState={connectionState}
    provider={provider}
    preferredProvider={aiBridgeSettings.preferredProvider}
    reason={connectionReason}
    retryable={connectionRetryable}
    token={aiBridgeSettings.token}
    url={aiBridgeSettings.url || bridgeConfig.url}
    permissions={normalizeAiPermissions(settings.aiPermissions)}
    externalAgentAccess={externalAgentAccess}
    onExternalAgentAccessChange={(value) => updateSettings({ externalAgentAccess: value })}
    capabilities={capabilities}
    requestedModel={aiBridgeSettings.requestedModel}
    requestedTokenBudget={aiBridgeSettings.requestedTokenBudget}
    colorScheme={colorScheme}
    onPermissionsChange={(aiPermissions) => updateSettings({ aiPermissions })}
    onConnect={handleConnect}
    onProviderChange={handleProviderChange}
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
          {connectionState === 'demo' ? t('aiChat.connection.demo') : connectionState === 'connected' ? t('aiChat.connection.connected', { provider: aiProviderLabel(provider) }) : connectionState === 'connecting' || connectionState === 'reconnecting' ? t('aiChat.connection.connecting') : t('aiChat.connection.error')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('aiChat.settings.open')} onPress={() => setShowSettings(true)}><Text style={{ color: colors.muted, fontSize: 15 }}>⚙</Text></Pressable>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
          <ConnectionCard
            state={connectionState}
            token={aiBridgeSettings.token}
            url={aiBridgeSettings.url || bridgeConfig.url}
            provider={provider}
            preferredProvider={aiBridgeSettings.preferredProvider}
            reason={connectionReason}
            retryable={connectionRetryable}
            colorScheme={colorScheme}
            onConnect={handleConnect}
            onProviderChange={handleProviderChange}
            onRetry={handleRetryConnection}
          />
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
          <MessageBubble key={message.id} role={message.role} text={message.text} attachments={message.attachments} contextLabel={message.contextLabel} colors={colors} importLabel={t('aiChat.attach.import')} unavailableLabel={t('aiChat.attach.unavailable')} onImport={async (attachment) => {
            if (attachment.assetId || attachment.kind !== 'image') return;
            const stored = await chatAttachmentRepository.get(attachment.id);
            if (!stored) return;
            const dataUri = `data:${stored.mimeType};base64,${await blobToBase64(stored.blob)}`;
            const asset = await addAssetToLibrary(dataUri, attachment.name, 'image');
            useAppStore.getState().addImageAssetToStory(storyId, asset.id);
            await chatAttachmentRepository.put({ ...stored, assetId: asset.id });
            markAttachmentImported(storyId, attachment.id, asset.id);
          }} />
        ))}

        {imageResults.map((result) => (
          <ImageResultCard
            key={result.requestId}
            result={result}
            storyId={storyId}
            colorScheme={colorScheme}
            onImported={async (assetId) => {
              const placement = await applyImportedImagePlacement(storyId, result.requestId, assetId, result.placement);
              if (!placement.ok) throw new Error(placement.error);
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

        {pendingFromExternalAgent ? (
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{t('aiChat.external.proposalLabel')}</Text>
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
              <Pressable
                accessibilityRole="button"
                onPress={() => { if (!mutationInFlightRef.current) setConfirmUndo(false); }}
              >
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
        {captureEditorContext ? <EditorContextChip storyId={storyId} colorScheme={colorScheme} /> : null}
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
      <ConfirmDialog
        visible={!!pendingProviderSwitch}
        title={t('aiChat.switchProvider.title')}
        message={t('aiChat.switchProvider.message')}
        confirmLabel={t('aiChat.switchProvider.confirm')}
        onCancel={() => setPendingProviderSwitch(undefined)}
        onConfirm={() => {
          const nextProvider = pendingProviderSwitch;
          setPendingProviderSwitch(undefined);
          if (nextProvider) applyProviderSwitch(nextProvider);
        }}
      />
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
  contextLabel,
  onImport,
  importLabel,
  unavailableLabel,
  colors,
}: {
  role: AiChatRole;
  text: string;
  attachments?: AttachmentRef[];
  /** What the message pointed at in the editor; shown under the author's words. */
  contextLabel?: string;
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
      {contextLabel ? (
        <Text numberOfLines={2} style={{ color: isUser ? '#ffffff' : colors.muted, opacity: 0.82, fontSize: 11, lineHeight: 15, marginTop: 4 }}>
          {`↳ ${contextLabel}`}
        </Text>
      ) : null}
    </View>
  );
}

function AttachmentLine({ attachment, isUser, colors, importLabel, unavailableLabel, onImport }: { attachment: AttachmentRef; isUser: boolean; colors: ReturnType<typeof useColors>; importLabel: string; unavailableLabel: string; onImport?: (attachment: AttachmentRef) => void | Promise<void> }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => { let active = true; void chatAttachmentRepository.get(attachment.id).then(value => { if (active) setAvailable(!!value); }); return () => { active = false; }; }, [attachment.id]);
  return <View><Text style={{ color: isUser ? '#ffffff' : colors.foreground, fontSize: 11, fontWeight: '700' }}>📎 {attachment.name} · {Math.ceil(attachment.byteSize / 1024)} KB</Text>{available === false ? <Text style={{ color: isUser ? '#ffffff' : colors.muted, fontSize: 10 }}>{unavailableLabel}</Text> : attachment.kind === 'image' && !attachment.assetId && onImport ? <Pressable accessibilityRole="button" onPress={() => { void onImport(attachment); }}><Text style={{ color: isUser ? '#ffffff' : colors.primary, fontSize: 11, textDecorationLine: 'underline' }}>{importLabel}</Text></Pressable> : null}</View>;
}
