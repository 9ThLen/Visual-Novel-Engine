import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ScreenContainer } from '@/components/screen-container';
import { StoryManuscriptScreen } from '@/components/editor/StoryManuscriptScreen';
import { spacing, typeScale } from '@/lib/design-tokens';
import { useI18n } from '@/hooks/use-i18n';
import { selectSceneRecordsForStory, selectStoryMetadata, useAppStore } from '@/stores/use-app-store';

export default function ManuscriptEditorRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const isLoaded = useAppStore((state) => state.isLoaded);
  const setCurrentStory = useAppStore((state) => state.loadCurrentStory);
  const { t } = useI18n();

  const storyMetadata = useAppStore(
    useMemo(() => {
      if (!storyId) {
        return () => undefined;
      }

      return selectStoryMetadata(storyId);
    }, [storyId])
  );

  const sceneRecords = useAppStore(
    useMemo(() => {
      if (!storyId) {
        return () => [];
      }

      return selectSceneRecordsForStory(storyId);
    }, [storyId])
  );

  useEffect(() => {
    if (storyId) {
      setCurrentStory(storyId);
    }
  }, [setCurrentStory, storyId]);

  if (!isLoaded) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: spacing.md, ...typeScale.label }}>{t('manuscript.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!storyId || !storyMetadata) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={typeScale.label}>{t('document.invalidRoute')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'left', 'right', 'bottom']}>
      <StoryManuscriptScreen
        storyId={storyId}
        storyMetadata={storyMetadata}
        sceneRecords={sceneRecords}
      />
    </ScreenContainer>
  );
}
