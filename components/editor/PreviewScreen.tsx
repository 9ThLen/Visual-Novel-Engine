/**
 * components/editor/PreviewScreen.tsx — Full preview mode
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useEditorStore } from '@/stores/use-editor-store';
import { useAppStore } from '@/stores/use-app-store';
import { resolvePreviewTimeline } from '@/lib/runtime-story';

export function PreviewScreen({ storyId, sceneId }: { storyId: string; sceneId: string }) {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const editorSceneId = useEditorStore((s) => s.sceneId);
  const editorTimeline = useEditorStore((s) => s.timeline);
  const editorIsDirty = useEditorStore((s) => s.isDirty);
  const scenesByStory = useAppStore((s) => s.scenesByStory);
  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);

  const previewTimeline = useMemo(
    () => resolvePreviewTimeline(
      { scenesByStory, sceneRecordsByStory },
      {
        storyId,
        sceneId,
        draftTimeline: editorIsDirty && editorSceneId === sceneId ? editorTimeline : undefined,
      }
    ),
    [editorIsDirty, editorSceneId, editorTimeline, sceneId, sceneRecordsByStory, scenesByStory, storyId]
  );
  const timeline = previewTimeline.timeline;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [showChoices, setShowChoices] = useState(false);
  const [sceneState, setSceneState] = useState({
    background: null as string | null,
    characters: [] as Array<{ id: string; sprite: string; position: string }>,
    music: null as string | null,
  });

  const currentStep = timeline[currentStepIndex];

  useEffect(() => {
    if (!currentStep) return;
    const data = currentStep.data as any;

    switch (currentStep.blockType) {
      case 'background':
        if (data.assetId) {
          setSceneState((s) => ({ ...s, background: data.assetId }));
        }
        break;
      case 'character':
        if (data.characterId) {
          setSceneState((s) => ({
            ...s,
            characters: [...s.characters, { id: data.characterId, sprite: data.spriteId, position: data.position }],
          }));
        }
        break;
      case 'text':
        if (data.content) {
          typewriteText(data.content, data.typewriterSpeed || 0.5);
        }
        break;
      case 'dialogue':
        if (data.entries?.length > 0) {
          const entry = data.entries[0];
          typewriteText(`${entry.characterId}: ${entry.text}`, 0.5);
        }
        break;
      case 'choice':
        if (data.options?.length > 0) {
          setShowChoices(true);
        }
        break;
      case 'music':
        if (data.assetId && data.action === 'play') {
          setSceneState((s) => ({ ...s, music: data.assetId }));
        }
        break;
    }
  }, [currentStepIndex, currentStep]);

  const typewriteText = (text: string, speed: number) => {
    setDisplayedText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayedText(text.substring(0, i));
      if (i >= text.length) {
        clearInterval(interval);
      }
    }, (1 - speed) * 50 + 20);
  };

  const handleAdvance = useCallback(() => {
    if (showChoices) return;
    if (currentStepIndex < timeline.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    } else {
      setIsPlaying(false);
    }
  }, [currentStepIndex, timeline.length, showChoices]);

  const handleChoiceSelect = (targetSceneId: string | null) => {
    setShowChoices(false);
    if (targetSceneId) {
      router.replace({
        pathname: '/scene-editor',
        params: { storyId, sceneId: targetSceneId },
      });
    }
  };

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const surfaceContainer = (colors as any)['surface-container'] || colors.surface;
  const secondaryColor = (colors as any).secondary || colors.primary;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Scene background */}
      <View style={{
        flex: 1,
        backgroundColor: sceneState.background ? colors.primary + '20' : '#111224',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {sceneState.background ? (
          <Text style={{ fontSize: 14, color: colors.muted }}>
            🖼 {sceneState.background}
          </Text>
        ) : (
          <Text style={{ fontSize: 14, color: colors.muted + '60' }}>No background</Text>
        )}

        {/* Characters */}
        {sceneState.characters.map((char, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              bottom: 220,
              left: getCharacterPosition(char.position),
              width: 80,
              height: 120,
              backgroundColor: secondaryColor + '30',
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 10, color: colors.muted }}>
              {char.id}
            </Text>
          </View>
        ))}
      </View>

      {/* Dialogue box */}
      {!showChoices && displayedText ? (
        <Pressable
          onPress={handleAdvance}
          style={{
            position: 'absolute',
            bottom: insets.bottom + 20,
            left: 20,
            right: 20,
            backgroundColor: surfaceContainer,
            borderRadius: 12,
            borderTopWidth: 2,
            borderTopColor: colors.primary,
            padding: 16,
          }}
        >
          <Text style={{ fontSize: 15, color: colors.foreground, lineHeight: 22 }}>
            {displayedText}
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 8, textAlign: 'right' }}>
            Tap to continue ▶
          </Text>
        </Pressable>
      ) : null}

      {/* Choices */}
      {showChoices && currentStep && currentStep.blockType === 'choice' ? (
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 20,
          left: 20,
          right: 20,
          gap: 8,
        }}>
          {(currentStep.data as any).options?.map((opt: any, i: number) => (
            <Pressable
              key={opt.id || i}
              onPress={() => handleChoiceSelect(opt.targetSceneId)}
              style={{
                backgroundColor: surfaceContainer,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>
                {opt.text || `Choice ${i + 1}`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Top controls */}
      <View style={{
        position: 'absolute',
        top: insets.top,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
      }}>
        <Pressable onPress={handleBack} style={{ padding: 8 }}>
          <Text style={{ color: '#fff', fontSize: 14 }}>← Back</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setIsPlaying(!isPlaying)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </Text>
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 12, alignSelf: 'center' }}>
            {currentStepIndex + 1}/{timeline.length}
          </Text>
        </View>
      </View>
    </View>
  );
}

function getCharacterPosition(position: string): number {
  switch (position) {
    case 'far-left': return 20;
    case 'left': return 60;
    case 'center': return 140;
    case 'right': return 220;
    case 'far-right': return 280;
    default: return 140;
  }
}
