/**
 * Interactive Objects Layer
 * Renders clickable objects on top of scene background
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Pressable,
  Image,
  Animated,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { getBundledAsset } from '@/lib/asset-resolver';
import type {
  InteractiveObject,
  InteractiveAction,
} from '@/lib/interactive-types';
import {
  getPointerEventsStyle,
  shouldUseNativeDriverForPlatform,
} from '@/lib/react-native-web-interop';

interface Props {
  objects: InteractiveObject[];
  onSceneTransition?: (sceneId: string) => void;
  onDialogue?: (text: string, speaker?: string) => void;
  onPlayAudio?: (audioUri: string, volume?: number, loop?: boolean) => void;
  onShowImage?: (imageUri: string, duration?: number) => void;
  onEvent?: (eventId: string, data?: Record<string, unknown>) => void;
}

export function InteractiveObjectsLayer({
  objects,
  onSceneTransition,
  onDialogue,
  onPlayAudio,
  onShowImage,
  onEvent,
}: Props) {
  const [clickedObjects, setClickedObjects] = useState<Set<string>>(new Set());

  const handleObjectPress = async (object: InteractiveObject) => {
    if (object.isActive === false) return;

    if (object.oneTimeOnly && clickedObjects.has(object.id)) return;

    if (object.oneTimeOnly) {
      setClickedObjects((prev) => new Set(prev).add(object.id));
    }

    for (const action of object.actions) {
      try {
        await executeAction(action);
      } catch (error) {
        if (__DEV__) console.error('[InteractiveObjects] Action failed:', action.type, error);
      }
    }
  };

  const executeAction = async (action: InteractiveAction): Promise<void> => {
    switch (action.type) {
      case 'dialogue':
        onDialogue?.(action.text, action.speaker);
        break;

      case 'scene_transition':
        onSceneTransition?.(action.targetSceneId);
        break;

      case 'play_audio':
        onPlayAudio?.(action.audioUri, action.volume, action.loop);
        break;

      case 'show_image':
        onShowImage?.(action.imageUri, action.duration);
        break;

      case 'trigger_event':
        onEvent?.(action.eventId, action.data);
        break;
      default:
        action satisfies never;
        break;
    }
  };

  return (
    <View style={[StyleSheet.absoluteFillObject, getPointerEventsStyle('box-none')]}>
      {objects.map((object) => (
        <InteractiveObjectView
          key={object.id}
          object={object}
          onPress={() => handleObjectPress(object)}
          isClicked={clickedObjects.has(object.id)}
        />
      ))}
    </View>
  );
}

// ── Individual Interactive Object ─────────────────────────────────────────

interface ObjectViewProps {
  object: InteractiveObject;
  onPress: () => void;
  isClicked: boolean;
}

function InteractiveObjectView({ object, onPress, isClicked }: ObjectViewProps) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const useNativeDriver = shouldUseNativeDriverForPlatform(Platform.OS);

  // Pulse animation
  useEffect(() => {
    if (object.pulseAnimation && !isClicked) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [object.pulseAnimation, isClicked, pulseAnim, useNativeDriver]);

  // Glow animation
  useEffect(() => {
    if (object.glowColor && !isClicked) {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver,
          }),
        ])
      );
      glow.start();
      return () => glow.stop();
    }
  }, [object.glowColor, isClicked, glowAnim, useNativeDriver]);

  // Don't render if one-time and already clicked
  if (object.oneTimeOnly && isClicked) {
    return null;
  }

  // Calculate absolute position
  const pos = object.position ?? { x: 0, y: 0, width: 10, height: 10 };

  const left = (pos.x / 100) * screenWidth;
  const top = (pos.y / 100) * screenHeight;
  const width = (pos.width / 100) * screenWidth;
  const height = (pos.height / 100) * screenHeight;

  return (
    <Animated.View
      style={[
        styles.objectContainer,
        {
          left,
          top,
          width,
          height,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.objectPressable,
          {
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        onPress={onPress}
      >
        {/* Glow effect */}
        {object.glowColor && !isClicked && (
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: object.glowColor,
                opacity: glowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.4],
                }),
                borderRadius: 8,
              },
            ]}
          />
        )}

        {/* Object image */}
        {object.imageUri ? (
          // Resolve bundled asset or fall back to URI
          (() => {
            const resolved = getBundledAsset(object.imageUri) ?? { uri: object.imageUri };
            return (
              <Image
                source={resolved}
                style={styles.objectImage}
                resizeMode="contain"
              />
            );
          })()
        ) : (
          // Debug outline (only in dev mode)
          __DEV__ && (
            <View
              style={[
                styles.debugOutline,
                {
                  borderColor: object.highlightOnHover ? colors.primary : colors.border,
                },
              ]}
            />
          )
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  objectContainer: {
    position: 'absolute',
  },
  objectPressable: {
    width: '100%',
    height: '100%',
  },
  objectImage: {
    width: '100%',
    height: '100%',
  },
  debugOutline: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 4,
  },
});
