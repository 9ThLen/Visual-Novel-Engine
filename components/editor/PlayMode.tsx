/**
 * components/editor/PlayMode.tsx - Play story scenes through the shared reader runtime.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { selectSceneRecordMapForStory, useAppStore } from '@/stores/use-app-store';
import { Button } from '@/components/ui';
import { StoryReaderResponsive } from '@/components/story-reader-responsive';
import { getNextSceneId, getStartSceneId } from '@/lib/reader-runtime';
import { useI18n } from '@/hooks/use-i18n';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface PlayModeProps {
  storyId: string;
}

type PlayState = 'idle' | 'playing' | 'finished';

export function PlayMode({ storyId }: PlayModeProps) {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const storyRecords = useAppStore(selectSceneRecordMapForStory(storyId));
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);
  const settings = useAppStore((s) => s.settings);

  const metadata = storiesMetadata.find((story) => story.id === storyId);
  const startSceneId = getStartSceneId(storyRecords, metadata?.startSceneId);

  const [playState, setPlayState] = useState<PlayState>('idle');
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);

  const currentScene = currentSceneId ? storyRecords[currentSceneId] : null;

  const handleStart = useCallback(() => {
    if (!startSceneId) return;
    setCurrentSceneId(startSceneId);
    setPlayState('playing');
  }, [startSceneId]);

  const handleReplay = useCallback(() => {
    if (!startSceneId) return;
    setCurrentSceneId(startSceneId);
    setPlayState('playing');
  }, [startSceneId]);

  const handleTransition = useCallback((targetSceneId: string | null) => {
    if (!currentSceneId) {
      setPlayState('finished');
      return;
    }

    const nextSceneId = getNextSceneId(storyRecords, currentSceneId, targetSceneId);
    if (nextSceneId) {
      setCurrentSceneId(nextSceneId);
      setPlayState('playing');
      return;
    }

    setPlayState('finished');
  }, [currentSceneId, storyRecords]);

  if (!startSceneId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PlayTopBar title={t('editor.playStory', undefined, 'Play Story')} onBack={() => router.back()} colors={colors} insetsTop={insets.top} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 16, textAlign: 'center' }}>
            {t('editor.noStartScene', undefined, 'No start scene set. Set a start scene in the Story Flow.')}
          </Text>
          <Button variant="primary" size="base" onPress={() => router.back()}>
            {t('menu.back')}
          </Button>
        </View>
      </View>
    );
  }

  if (playState === 'idle') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PlayTopBar title={metadata?.title || 'Story'} onBack={() => router.back()} colors={colors} insetsTop={insets.top} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.foreground, marginBottom: 8, textAlign: 'center' }}>
            {metadata?.title || 'Story'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 24 }}>
            {Object.keys(storyRecords).length} scenes
          </Text>
          <Button variant="primary" size="lg" onPress={handleStart}>
            {t('reader.startPlaying', undefined, 'Start Playing')}
          </Button>
        </View>
      </View>
    );
  }

  if (playState === 'finished' || !currentScene) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PlayTopBar title={metadata?.title || 'Story'} onBack={() => router.back()} colors={colors} insetsTop={insets.top} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.foreground, marginBottom: 8 }}>
            {t('reader.theEnd', undefined, 'The End')}
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 24 }}>
            {t('reader.storyComplete', undefined, 'Story complete')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant="secondary" size="base" onPress={() => router.back()}>
              {t('menu.back')}
            </Button>
            <Button variant="primary" size="base" onPress={handleReplay}>
              {t('reader.replay', undefined, 'Replay')}
            </Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PlayTopBar title={currentScene.name || metadata?.title || 'Story'} onBack={() => router.back()} colors={colors} insetsTop={insets.top} />
      <StoryReaderResponsive
        key={currentScene.id}
        sceneId={currentScene.id}
        timeline={currentScene.timeline || []}
        settings={settings}
        onTransition={handleTransition}
        routeOnExecutorComplete
      />
    </View>
  );
}

function PlayTopBar({
  title,
  onBack,
  colors,
  insetsTop,
}: {
  title: string;
  onBack: () => void;
  colors: ReturnType<typeof useColors>;
  insetsTop: number;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: insetsTop + 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
      zIndex: 10,
    }}>
      <Pressable onPress={onBack} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel="Back">
        <IconSymbol name="chevron.right" size={20} color={colors.primary} style={{ transform: [{ rotate: '180deg' }] }} />
      </Pressable>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.foreground }} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
