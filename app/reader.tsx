import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { StoryReaderResponsive } from '@/components/story-reader-responsive';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';
import { ReaderMenu } from '@/components/ReaderMenu';
import { useStoryState } from '@/lib/story-hooks';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import type { PlaybackState, SceneState } from '@/lib/engine/types';
import { enhancedAudioManager as audioManager } from '@/lib/audio-manager-enhanced';
import { resolvePlayableAssetUri } from '@/lib/asset-resolver';
import { useReaderAudio, stopReaderPlayback } from '@/hooks/useReaderAudio';
import { useReaderInitialization } from '@/hooks/useReaderInitialization';
import { buttonFeedback } from '@/lib/ui-feedback';
import { parseResumeExisting } from '@/lib/reader-launch';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getTimelineInteractiveObjects } from '@/lib/reader-runtime';

function useReaderRouteParams(): { storyId: string | null; resumeExisting: boolean } {
  const { storyId, resume } = useLocalSearchParams();
  return {
    storyId: Array.isArray(storyId) ? storyId[0] : storyId ?? null,
    resumeExisting: parseResumeExisting(resume),
  };
}

export default function ReaderScreen() {
  const router = useRouter();
  const colors = useColors();
  const { storyId, resumeExisting } = useReaderRouteParams();
  const { settings, sceneRecordsByStory } = useStoryState();
  const [showMenu, setShowMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [readerSceneState, setReaderSceneState] = useState<SceneState | null>(null);
  const [objDialogue, setObjDialogue] = useState<{ text: string; speaker?: string } | null>(null);
  const pendingChoiceRef = useRef<{ sceneId: string; choiceId: string; targetSceneId: string | null } | null>(null);
  const { t } = useI18n();

  const { isLoading, sceneRecord, timeline, story, playbackState, updatePlaybackState } = useReaderInitialization(
    storyId ?? undefined,
    { resumeExisting },
  );
  const interactiveObjects = React.useMemo(
    () => getTimelineInteractiveObjects(timeline),
    [timeline],
  );

  useReaderAudio(story?.id ?? storyId ?? undefined, sceneRecord, settings, {
    sceneState: readerSceneState,
    blockedByOverlay: showMenu || historyOpen,
  });

  useEffect(() => {
    setObjDialogue(null);
    setReaderSceneState(null);
  }, [playbackState?.currentSceneId]);

  const navigateToScene = useCallback((sceneId: string, choicesMade?: { sceneId: string; choiceId: string }[]) => {
    if (!story || !playbackState) return;
    if (!sceneRecordsByStory[story.id]?.[sceneId]) {
      console.warn('[ReaderScreen] navigateToScene: target scene not found', sceneId);
      return;
    }
    const updated: PlaybackState = {
      storyId: story.id,
      currentSceneId: sceneId,
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: choicesMade || playbackState?.choicesMade || [],
    };
    updatePlaybackState(updated);
  }, [story, playbackState, sceneRecordsByStory, updatePlaybackState]);

  const handleTransition = (targetSceneId: string | null) => {
    if (isLoading || !playbackState) return;
    const pendingChoice = pendingChoiceRef.current;
    pendingChoiceRef.current = null;
    const transitionChoice = pendingChoice
      ? { sceneId: pendingChoice.sceneId, choiceId: pendingChoice.choiceId }
      : { sceneId: playbackState.currentSceneId, choiceId: 'transition' };
    const updatedChoices = [...playbackState.choicesMade, transitionChoice];

    if (targetSceneId) {
      navigateToScene(targetSceneId, updatedChoices);
    } else {
      updatePlaybackState({
        ...playbackState,
        isPlaying: false,
        choicesMade: updatedChoices,
      });
      void stopReaderPlayback(audioManager);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/tabs');
      }
    }
  };

  const handleExecutorChoiceSelect = useCallback((choice: { sceneId: string; choiceId: string; targetSceneId: string | null }) => {
    pendingChoiceRef.current = choice;
  }, []);

  const handleObjectSceneTransition = (sceneId: string) => {
    navigateToScene(sceneId);
  };

  const handleObjectDialogue = (text: string, speaker?: string) => {
    setObjDialogue({ text, speaker });
  };

  const sfxPoolIndexRef = React.useRef(0);
  const MAX_SFX_TRACKS = 5;

  const handleObjectPlayAudio = (audioUri: string, volume?: number, loop?: boolean) => {
    resolvePlayableAssetUri(audioUri).then((uri) => {
      if (uri) {
        sfxPoolIndexRef.current = (sfxPoolIndexRef.current + 1) % MAX_SFX_TRACKS;
        const trackId = `sfx_object_${sfxPoolIndexRef.current}`;
        audioManager.play(trackId, uri, { volume: volume ?? 0.7, loop: loop ?? false });
      }
    }).catch(() => {});
  };

  if (isLoading || !story || !timeline) {
    const timedOut = !isLoading && (!story || !timeline);
    return (
      <ScreenContainer className="items-center justify-center gap-4">
        <Text style={{ color: colors.foreground, fontSize: 16 }}>
          {timedOut ? t('reader.notFound') : t('reader.loading')}
        </Text>
        {(timedOut || !isLoading) && (
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('menu.back')}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{t('menu.back')}</Text>
          </Pressable>
        )}
      </ScreenContainer>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ReaderMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
      />

      <Pressable
        style={({ pressed }) => ({
          position: 'absolute',
          top: 48,
          left: 16,
          zIndex: showMenu ? 99 : 50,
          backgroundColor: colors.backdrop,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        })}
        onPress={() => {
          buttonFeedback();
          setShowMenu(!showMenu);
        }}
        accessibilityRole="button"
        accessibilityLabel={showMenu ? t('menu.closeReader') : t('menu.openReader')}
      >
        <IconSymbol name="menu" size={18} color={colors['text-inverse']} />
      </Pressable>

      <StoryReaderResponsive
        sceneId={sceneRecord?.id ?? playbackState!.currentSceneId}
        timeline={timeline}
        onTransition={handleTransition}
        onExecutorChoiceSelect={handleExecutorChoiceSelect}
        onSceneStateChange={setReaderSceneState}
        isLoading={isLoading}
        settings={settings}
        onHistoryVisibleChange={setHistoryOpen}
        routeOnExecutorComplete={true}
      />

      {interactiveObjects.length > 0 && (
        <InteractiveObjectsLayer
          objects={interactiveObjects}
          onSceneTransition={handleObjectSceneTransition}
          onDialogue={handleObjectDialogue}
          onPlayAudio={handleObjectPlayAudio}
        />
      )}

      {objDialogue && (
        <Pressable
          style={{
            position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center',
            backgroundColor: colors.backdrop, zIndex: 100,
          }}
          onPress={() => setObjDialogue(null)}
          accessibilityRole="button"
          accessibilityLabel={t('reader.dismissObjectDialogue')}
        >
          <View
            style={{
              backgroundColor: colors.dialogueBg,
              borderRadius: 16, padding: 20, marginHorizontal: 32, maxWidth: 400,
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            {objDialogue.speaker && (
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                {objDialogue.speaker}
              </Text>
            )}
            <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 24 }}>
              {objDialogue.text}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
