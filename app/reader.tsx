import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { StoryReaderResponsive } from '@/components/story-reader-responsive';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';
import { ReaderMenu } from '@/components/ReaderMenu';
import { useStoryState } from '@/lib/story-hooks';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { Choice, PlaybackState } from '@/lib/types';
import { enhancedAudioManager as audioManager } from '@/lib/audio-manager-enhanced';
import { resolvePlayableAssetUri } from '@/lib/asset-resolver';
import { useReaderAudio, stopReaderPlayback } from '@/hooks/useReaderAudio';
import { useReaderInitialization } from '@/hooks/useReaderInitialization';
import { buttonFeedback } from '@/lib/ui-feedback';
import { parseResumeExisting } from '@/lib/reader-launch';

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
  const { settings } = useStoryState();
  const [showMenu, setShowMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [objDialogue, setObjDialogue] = useState<{ text: string; speaker?: string } | null>(null);
  const { t } = useI18n();

  const { isLoading, currentScene, sceneRecord, timeline, story, playbackState, updatePlaybackState } = useReaderInitialization(
    storyId ?? undefined,
    { resumeExisting },
  );

  useReaderAudio(story?.id ?? storyId ?? undefined, currentScene, settings, {
    blockedByOverlay: showMenu || historyOpen,
  });

  useEffect(() => {
    setObjDialogue(null);
  }, [playbackState?.currentSceneId]);

  const navigateToScene = useCallback((sceneId: string, choicesMade?: { sceneId: string; choiceId: string }[]) => {
    if (!story || !playbackState) return;
    const updated: PlaybackState = {
      storyId: story.id,
      currentSceneId: sceneId,
      isPlaying: true,
      currentDialogueIndex: 0,
      choicesMade: choicesMade || playbackState?.choicesMade || [],
    };
    updatePlaybackState(updated);
  }, [story, playbackState, updatePlaybackState]);

  const handleTransition = (targetSceneId: string | null) => {
    if (isLoading || !playbackState) return;
    if (targetSceneId) {
      const updatedChoices = [
        ...playbackState.choicesMade,
        { sceneId: playbackState.currentSceneId, choiceId: 'transition' },
      ];
      navigateToScene(targetSceneId, updatedChoices);
    } else {
      void stopReaderPlayback(audioManager);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/tabs');
      }
    }
  };

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
    <View style={{ flex: 1, backgroundColor: '#000' }}>
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
          backgroundColor: 'rgba(0,0,0,0.45)',
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.18)',
          opacity: pressed ? 0.8 : 1,
        })}
        onPress={() => {
          buttonFeedback();
          setShowMenu(!showMenu);
        }}
        accessibilityRole="button"
        accessibilityLabel={showMenu ? 'Close reader menu' : 'Open reader menu'}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>☰</Text>
      </Pressable>

      <StoryReaderResponsive
        timeline={timeline}
        onTransition={handleTransition}
        isLoading={isLoading}
        settings={settings}
        onHistoryVisibleChange={setHistoryOpen}
      />

      {currentScene?.interactiveObjects && currentScene.interactiveObjects.length > 0 && (
        <InteractiveObjectsLayer
          objects={currentScene.interactiveObjects}
          onSceneTransition={handleObjectSceneTransition}
          onDialogue={handleObjectDialogue}
          onPlayAudio={handleObjectPlayAudio}
        />
      )}

      {objDialogue && (
        <Pressable
          style={{
            position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 100,
          }}
          onPress={() => setObjDialogue(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss object dialogue"
        >
          <View
            style={{
              backgroundColor: colors.dialogueBg ?? 'rgba(15,14,23,0.92)',
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
