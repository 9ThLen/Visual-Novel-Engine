import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';
import { respond } from '@/lib/ai/fake-agent';
import { applyAiScenePatchToStore, rollbackAiPatch } from '@/lib/ai/scene-patch-adapter';
import { describeAiScenePatch, validateAiScenePatch, type PatchProjectContext } from '@/lib/ai/scene-patch';
import { buildAiStoryContext } from '@/lib/ai/story-context';
import { getStoryImageAssets } from '@/lib/story-image-library';
import { BridgeClient } from '@/lib/bridge-client';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import { useAppStore } from '@/stores/use-app-store';
import { useAiChatStore, type AiChatRole } from '@/stores/ai-chat-store';
import { PatchPreviewCard } from './PatchPreviewCard';

interface AiChatPanelProps {
  storyId: string;
  activeSceneId: string | null;
  colorScheme?: ColorScheme;
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

export function AiChatPanel({ storyId, activeSceneId, colorScheme }: AiChatPanelProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();

  const messages = useAiChatStore((s) => s.messages);
  const status = useAiChatStore((s) => s.status);
  const pendingPatch = useAiChatStore((s) => s.pendingPatch);
  const lastAppliedSnapshot = useAiChatStore((s) => s.lastAppliedSnapshot);
  const addMessage = useAiChatStore((s) => s.addMessage);
  const setStatus = useAiChatStore((s) => s.setStatus);
  const setPendingPatch = useAiChatStore((s) => s.setPendingPatch);
  const setLastAppliedSnapshot = useAiChatStore((s) => s.setLastAppliedSnapshot);

  const [inputText, setInputText] = useState('');
  const [applying, setApplying] = useState(false);
  const bridgeRef = useRef<BridgeClient | null>(null);
  const assistantTextRef = useRef('');
  const patchDecisionRef = useRef<((value: unknown) => void) | null>(null);

  useEffect(() => {
    const token = process.env.EXPO_PUBLIC_AI_BRIDGE_TOKEN;
    if (!token || typeof WebSocket === 'undefined') return;
    const client = new BridgeClient({
      url: process.env.EXPO_PUBLIC_AI_BRIDGE_URL ?? 'ws://127.0.0.1:8787',
      token,
      onConnectionChange: () => undefined,
      onEvent: (message) => {
        const payload = typeof message.payload === 'object' && message.payload ? message.payload as Record<string, unknown> : {};
        if (message.type === 'assistant_delta' && typeof payload.text === 'string') assistantTextRef.current += payload.text;
        if (message.type === 'assistant_done') {
          if (assistantTextRef.current) addMessage('assistant', assistantTextRef.current);
          assistantTextRef.current = '';
          setStatus(useAiChatStore.getState().pendingPatch ? 'awaiting_confirmation' : 'idle');
        }
        if (message.type === 'error') {
          addMessage('system', typeof payload.message === 'string' ? payload.message : t('aiChat.applyFailedGeneric'));
          setStatus('idle');
        }
      },
      onToolCall: async (_id, name, input) => {
        const state = useAppStore.getState();
        const value = typeof input === 'object' && input ? input as Record<string, unknown> : {};
        if (name === 'get_story_overview') return { ok: true, result: { storyId, activeSceneId, sceneCount: Object.keys(state.sceneRecordsByStory[storyId] ?? {}).length } };
        if (name === 'list_scenes') return { ok: true, result: Object.values(state.sceneRecordsByStory[storyId] ?? {}).map(scene => ({ id: scene.id, name: scene.name })) };
        if (name === 'get_scene') {
          const sceneId = typeof value.sceneId === 'string' ? value.sceneId : activeSceneId;
          const context = sceneId ? buildAiStoryContext(storyId, sceneId) : null;
          return context ? { ok: true, result: context } : { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Scene not found' };
        }
        if (name === 'propose_scene_patch') {
          const patch = value.patch as AiScenePatch;
          const scene = state.sceneRecordsByStory[storyId]?.[patch?.sceneId];
          if (!scene) return { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: 'Scene not found' };
          const validation = validateAiScenePatch(scene, patch, buildPatchProjectContext(storyId));
          if (!validation.ok) return { ok: false, errorCode: 'VALIDATION_FAILED', errorMessage: validation.errors.join('; ') };
          setPendingPatch({ patch, description: describeAiScenePatch(scene, patch) });
          return new Promise(resolve => { patchDecisionRef.current = result => resolve({ ok: true, result }); });
        }
        return { ok: false, errorCode: 'PROTOCOL_ERROR', errorMessage: `Unsupported tool: ${name}` };
      },
    });
    bridgeRef.current = client;
    client.connect();
    return () => { patchDecisionRef.current?.({ accepted: false, reason: 'panel_closed' }); client.close(); bridgeRef.current = null; };
  }, [storyId, activeSceneId, addMessage, setPendingPatch, setStatus, t]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || status !== 'idle') return;
    setInputText('');
    addMessage('user', text);

    const ctx = activeSceneId ? buildAiStoryContext(storyId, activeSceneId) : null;
    if (!ctx) {
      addMessage('assistant', t('aiChat.noActiveScene'));
      return;
    }

    setStatus('thinking');
    if (bridgeRef.current) {
      assistantTextRef.current = '';
      bridgeRef.current.sendUserMessage(text);
      return;
    }
    const response = await respond(text, ctx);

    if (response.kind === 'text') {
      addMessage('assistant', response.text);
      setStatus('idle');
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
  }, [inputText, status, activeSceneId, storyId, addMessage, setStatus, setPendingPatch, t]);

  const handleApply = useCallback(async () => {
    if (!pendingPatch) return;
    setApplying(true);
    try {
      const result = await applyAiScenePatchToStore(pendingPatch.patch);
      if (result.ok) {
        setLastAppliedSnapshot({ storyId, snapshotId: result.snapshotId });
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
  }, [pendingPatch, storyId, addMessage, setLastAppliedSnapshot, setPendingPatch, t]);

  const handleReject = useCallback(() => {
    setPendingPatch(null);
    addMessage('system', t('aiChat.rejected'));
    patchDecisionRef.current?.({ accepted: false, reason: 'rejected' });
    patchDecisionRef.current = null;
  }, [addMessage, setPendingPatch, t]);

  const handleRollback = useCallback(async () => {
    if (!lastAppliedSnapshot) return;
    const ok = await rollbackAiPatch(lastAppliedSnapshot.storyId, lastAppliedSnapshot.snapshotId);
    addMessage('system', ok ? t('aiChat.rollbackSuccess') : t('aiChat.rollbackFailed'));
    if (ok) setLastAppliedSnapshot(null);
  }, [lastAppliedSnapshot, addMessage, setLastAppliedSnapshot, t]);

  const canSend = status === 'idle' && inputText.trim().length > 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
        {messages.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>{t('aiChat.emptyState')}</Text>
        ) : null}

        {messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} text={message.text} colors={colors} />
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

        {lastAppliedSnapshot ? (
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
        <Pressable
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
        </Pressable>
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
      <Text style={{ color: isUser ? '#ffffff' : colors.foreground, fontSize: 13, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}
