import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useEditorStore } from '@/stores/use-editor-store';
import { useAppStore } from '@/stores/use-app-store';
import { useSceneExecutor } from '@/lib/engine/useSceneExecutor';
import { resolvePreviewTimeline } from '@/lib/runtime-story';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { AudioPlayerService } from '@/lib/audio-player-service';
import { useI18n } from '@/lib/i18n';

export function PreviewScreen({ storyId, sceneId }: { storyId: string; sceneId: string }) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
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

  const { sceneState, currentStepIndex, isComplete, isTyping, advance, selectChoice } =
    useSceneExecutor(timeline);

  const [displayedText, setDisplayedText] = useState('');
  const audioServiceRef = useRef(new AudioPlayerService());
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = timeline[currentStepIndex];

  const currentText = useMemo(() => {
    if (!currentStep) return '';
    const data = currentStep.data as any;
    if (currentStep.blockType === 'text') return data.content || '';
    if (currentStep.blockType === 'dialogue') {
      const entry = data.entries?.[data.currentEntryIndex ?? 0] ?? data.entries?.[0];
      return entry ? `${entry.characterId}: ${entry.text}` : '';
    }
    return '';
  }, [currentStep]);

  const [backgroundSource, setBackgroundSource] = useState<number | { uri: string } | null>(null);

  useEffect(() => {
    let active = true;
    if (!sceneState.backgroundAssetId) {
      setBackgroundSource(null);
      return () => { active = false; };
    }
    resolveAssetUri(sceneState.backgroundAssetId)
      .then((resolved) => {
        if (!active || !resolved) {
          if (active) setBackgroundSource(null);
          return;
        }
        setBackgroundSource(typeof resolved === 'number' ? resolved : { uri: resolved });
      })
      .catch(() => { if (active) setBackgroundSource(null); });
    return () => { active = false; };
  }, [sceneState.backgroundAssetId]);

  const prevMusicTrackRef = useRef<string | null>(null);
  useEffect(() => {
    const currentTrack = sceneState.musicTrackId;
    if (currentTrack && currentTrack !== prevMusicTrackRef.current) {
      void audioServiceRef.current.play('preview-bgm', currentTrack, {
        volume: typeof sceneState.musicVolume === 'number' ? sceneState.musicVolume : 0.8,
        loop: true,
      });
    } else if (!currentTrack && prevMusicTrackRef.current) {
      void audioServiceRef.current.stop('preview-bgm', 300);
    }
    prevMusicTrackRef.current = currentTrack;
  }, [sceneState.musicTrackId, sceneState.musicVolume]);

  const typewriteText = useCallback((text: string) => {
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    if (!text) { setDisplayedText(''); return; }
    setDisplayedText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayedText(text.substring(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        typewriterIntervalRef.current = null;
      }
    }, 30);
    typewriterIntervalRef.current = interval;
  }, []);

  useEffect(() => {
    if (currentText && (currentStep?.blockType === 'text' || currentStep?.blockType === 'dialogue')) {
      typewriteText(currentText);
    } else {
      setDisplayedText('');
    }
  }, [currentStepIndex, currentText, currentStep, typewriteText]);

  useEffect(() => {
    return () => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
      void audioServiceRef.current.cleanup();
    };
  }, []);

  const handleAdvance = useCallback(() => {
    advance();
  }, [advance]);

  const handleChoiceSelect = useCallback((optionId: string) => {
    selectChoice(optionId);
  }, [selectChoice]);

  const handleBack = useCallback(() => {
    void audioServiceRef.current.cleanup();
    router.back();
  }, [router]);

  const surfaceContainer = (colors as any)['surface-container'] || colors.surface;
  const secondaryColor = (colors as any).secondary || colors.primary;
  const showChoices = !!sceneState.currentChoices;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{
        flex: 1,
        backgroundColor: colors['surface-1'] ?? colors.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {backgroundSource ? (
          <Image
            source={backgroundSource}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : sceneState.backgroundAssetId ? (
          <Text style={{ fontSize: 14, color: colors.muted }}>
            {t('editor.loadingBackground')}
          </Text>
        ) : (
          <Text style={{ fontSize: 14, color: `${colors.muted}99` }}>{t('editor.noBackground')}</Text>
        )}

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
              {char.characterId}
            </Text>
          </View>
        ))}
      </View>

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
          accessibilityRole="button"
          accessibilityLabel={t('reader.continueReading')}
        >
          <Text style={{ fontSize: 15, color: colors.foreground, lineHeight: 22 }}>
            {displayedText}
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 8, textAlign: 'right' }}>
            {isTyping ? t('reader.tapToSpeedUp') : `${t('reader.tapToContinue')} ▶`}
          </Text>
        </Pressable>
      ) : null}

      {showChoices && sceneState.currentChoices ? (
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 20,
          left: 20,
          right: 20,
          gap: 8,
        }}>
          {sceneState.currentChoices.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => handleChoiceSelect(opt.id)}
              style={{
                backgroundColor: surfaceContainer,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                alignItems: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel={t('reader.choiceLabel', { text: opt.text || opt.id })}
            >
              <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>
                {opt.text || `Choice ${opt.id}`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {isComplete && (
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 20,
          left: 20,
          right: 20,
        }}>
          <Pressable
            onPress={handleBack}
            style={{
              backgroundColor: surfaceContainer,
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={t('menu.back')}
          >
            <Text style={{ fontSize: 14, color: colors.foreground }}>
              Scene complete — tap to exit preview
            </Text>
          </Pressable>
        </View>
      )}

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
        <Pressable onPress={handleBack} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
          <Text style={{ color: colors['text-inverse'] ?? '#fff', fontSize: 14 }}>← {t('menu.back')}</Text>
        </Pressable>
        <Text style={{ color: colors['text-inverse'] ?? '#fff', fontSize: 12, alignSelf: 'center' }}>
          {currentStepIndex + 1}/{timeline.length}
        </Text>
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
