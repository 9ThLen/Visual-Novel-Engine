/**
 * components/editor/PlayMode.tsx — Play through connected scenes sequentially
 *
 * Reads the story's scene graph from start scene, follows connections,
 * and plays each scene's timeline in sequence.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Animated, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useAppStore } from '@/stores/use-app-store';
import { Button } from '@/components/ui';
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';

interface PlayModeProps {
  storyId: string;
}

type PlayState = 'idle' | 'playing' | 'paused' | 'finished' | 'choice';

interface PlayScene {
  scene: SceneRecord;
  currentStepIndex: number;
}

export function PlayMode({ storyId }: PlayModeProps) {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const sceneRecordsByStory = useAppStore((s) => s.sceneRecordsByStory);
  const storiesMetadata = useAppStore((s) => s.storiesMetadata);

  const storyRecords: Record<string, SceneRecord> = sceneRecordsByStory[storyId] || {};
  const metadata = storiesMetadata.find((m) => m.id === storyId);
  const startSceneId = metadata?.startSceneId || Object.values(storyRecords).find((s) => s.isStart)?.id;

  const [playState, setPlayState] = useState<PlayState>('idle');
  const [currentScene, setCurrentScene] = useState<PlayScene | null>(null);
  const [sceneStack, setSceneStack] = useState<PlayScene[]>([]);
  const [dialogueText, setDialogueText] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [showChoices, setShowChoices] = useState(false);
  const [choices, setChoices] = useState<Array<{ id: string; text: string; targetSceneId: string | null }>>([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find start scene
  const getStartScene = useCallback((): SceneRecord | null => {
    if (!startSceneId) return null;
    return storyRecords[startSceneId] || null;
  }, [startSceneId, storyRecords]);

  // Start playing from the start scene
  const handleStart = useCallback(() => {
    const start = getStartScene();
    if (!start) return;
    setCurrentScene({ scene: start, currentStepIndex: 0 });
    setSceneStack([]);
    setPlayState('playing');
    setDialogueText('');
    setSpeakerName('');
    setShowChoices(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [getStartScene, fadeAnim]);

  // Process current step
  const processStep = useCallback((scene: PlayScene) => {
    const { scene: sceneRecord, currentStepIndex } = scene;
    const timeline = sceneRecord.timeline || [];

    if (currentStepIndex >= timeline.length) {
      // Scene finished — follow 'next' connection or end
      const nextConn = (sceneRecord.connections || []).find((c) => c.outputPort === 'next');
      if (nextConn && storyRecords[nextConn.targetSceneId]) {
        const nextScene = storyRecords[nextConn.targetSceneId];
        setCurrentScene({ scene: nextScene, currentStepIndex: 0 });
      } else {
        setPlayState('finished');
      }
      return;
    }

    const step = timeline[currentStepIndex];
    const nextIndex = currentStepIndex + 1;

    // Process based on block type
    switch (step.blockType) {
      case 'dialogue': {
        const data = step.data as any;
        const entries = data.entries || [];
        const text = entries[0]?.text || data.text || '';
        const speaker = entries[0]?.characterId || data.speaker || '';
        setDialogueText(text);
        setSpeakerName(speaker);
        setCurrentScene({ ...scene, currentStepIndex: nextIndex });
        // Auto-advance after delay
        timerRef.current = setTimeout(() => {
          processStep({ ...scene, currentStepIndex: nextIndex });
        }, Math.max(2000, text.length * 50));
        break;
      }
      case 'text': {
        const data = step.data as any;
        const content = data.content || data.text || '';
        setDialogueText(content);
        setSpeakerName('');
        setCurrentScene({ ...scene, currentStepIndex: nextIndex });
        timerRef.current = setTimeout(() => {
          processStep({ ...scene, currentStepIndex: nextIndex });
        }, Math.max(2000, content.length * 50));
        break;
      }
      case 'choice': {
        const data = step.data as any;
        const options = (data.options || []).map((o: any) => ({
          id: o.id,
          text: o.text,
          targetSceneId: o.targetSceneId || null,
        }));
        setChoices(options);
        setShowChoices(true);
        setPlayState('choice');
        setCurrentScene({ ...scene, currentStepIndex: nextIndex });
        break;
      }
      case 'transition': {
        const data = step.data as any;
        const duration = data.duration || 1;
        // Fade out effect
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: duration * 500,
          useNativeDriver: true,
        }).start(() => {
          fadeAnim.setValue(1);
          processStep({ ...scene, currentStepIndex: nextIndex });
        });
        break;
      }
      default:
        // Skip other block types
        setCurrentScene({ ...scene, currentStepIndex: nextIndex });
        timerRef.current = setTimeout(() => {
          processStep({ ...scene, currentStepIndex: nextIndex });
        }, 500);
        break;
    }
  }, [storyRecords, fadeAnim]);

  // Auto-start processing when scene changes
  useEffect(() => {
    if (playState === 'playing' && currentScene) {
      const timer = setTimeout(() => processStep(currentScene), 300);
      return () => clearTimeout(timer);
    }
  }, [playState, currentScene?.scene.id, currentScene?.currentStepIndex]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Handle choice selection
  const handleChoice = useCallback((choice: { id: string; text: string; targetSceneId: string | null }) => {
    setShowChoices(false);
    setChoices([]);
    if (choice.targetSceneId && storyRecords[choice.targetSceneId]) {
      // Push current scene to stack (for potential back navigation)
      if (currentScene) {
        setSceneStack((prev) => [...prev, currentScene]);
      }
      const nextScene = storyRecords[choice.targetSceneId];
      setCurrentScene({ scene: nextScene, currentStepIndex: 0 });
      setPlayState('playing');
    } else {
      setPlayState('finished');
    }
  }, [currentScene, storyRecords]);

  // Pause/Resume
  const handlePause = useCallback(() => {
    if (playState === 'playing') {
      setPlayState('paused');
      if (timerRef.current) clearTimeout(timerRef.current);
    } else if (playState === 'paused') {
      setPlayState('playing');
      if (currentScene) processStep(currentScene);
    }
  }, [playState, currentScene, processStep]);

  // No start scene
  if (!startSceneId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
        }}>
          <Pressable onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={{ color: colors.primary, fontSize: 18 }}>←</Text>
          </Pressable>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>Play Story</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 16 }}>
            No start scene set. Set a start scene in the Story Flow.
          </Text>
          <Button variant="primary" size="base" onPress={() => router.back()}>
            ← Back to Story Flow
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Top bar */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: insets.top + 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <Pressable onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>←</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>
          {currentScene?.scene.name || 'Ready to Play'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {playState === 'playing' && (
            <Button variant="ghost" size="sm" onPress={handlePause}>⏸ Pause</Button>
          )}
          {playState === 'paused' && (
            <Button variant="primary" size="sm" onPress={handlePause}>▶ Resume</Button>
          )}
          {playState === 'idle' && (
            <Button variant="primary" size="sm" onPress={handleStart}>▶ Play</Button>
          )}
        </View>
      </View>

      {/* Main content area */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {playState === 'idle' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.foreground, marginBottom: 8 }}>
              {metadata?.title || 'Story'}
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 24 }}>
              {Object.keys(storyRecords).length} scenes
            </Text>
            <Button variant="primary" size="lg" onPress={handleStart}>
              ▶ Start Playing
            </Button>
          </View>
        )}

        {playState === 'playing' && currentScene && (
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: 16 }}>
            {/* Dialogue box */}
            {dialogueText ? (
              <View style={{
                backgroundColor: colors.surface + 'F0',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 16,
              }}>
                {speakerName ? (
                  <Text style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.primary,
                    marginBottom: 6,
                  }}>
                    {speakerName}
                  </Text>
                ) : null}
                <Text style={{
                  fontSize: 16,
                  color: colors.foreground,
                  lineHeight: 24,
                }}>
                  {dialogueText}
                </Text>
              </View>
            ) : (
              // Background scene view
              <View style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>
                  Step {currentScene.currentStepIndex + 1} / {(currentScene.scene.timeline || []).length}
                </Text>
              </View>
            )}
          </View>
        )}

        {playState === 'choice' && choices.length > 0 && (
          <View style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            gap: 8,
          }}>
            {choices.map((choice) => (
              <Pressable
                key={choice.id}
                onPress={() => handleChoice(choice)}
                style={{
                  backgroundColor: colors.surface + 'F0',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  padding: 14,
                }}
              >
                <Text style={{ fontSize: 15, color: colors.foreground, textAlign: 'center' }}>
                  {choice.text}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {playState === 'paused' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, color: colors.muted }}>⏸ Paused</Text>
          </View>
        )}

        {playState === 'finished' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.foreground, marginBottom: 8 }}>
              The End
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 24 }}>
              Story complete
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="secondary" size="base" onPress={() => router.back()}>
                ← Back
              </Button>
              <Button variant="primary" size="base" onPress={handleStart}>
                ↻ Replay
              </Button>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}
