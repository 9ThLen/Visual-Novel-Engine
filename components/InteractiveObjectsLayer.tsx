/**
 * Interactive Objects Layer
 * Renders clickable objects on top of scene background
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  Image,
  Animated,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useInventory } from '@/lib/inventory-context';
import type {
  InteractiveObject,
  InteractiveAction,
  InteractionResult,
} from '@/lib/interactive-types';

interface Props {
  objects: InteractiveObject[];
  onSceneTransition?: (sceneId: string) => void;
  onDialogue?: (text: string, speaker?: string) => void;
  onPlayAudio?: (audioUri: string, volume?: number, loop?: boolean) => void;
  onShowImage?: (imageUri: string, duration?: number) => void;
  onEvent?: (eventId: string, data?: Record<string, any>) => void;
}

export function InteractiveObjectsLayer({
  objects,
  onSceneTransition,
  onDialogue,
  onPlayAudio,
  onShowImage,
  onEvent,
}: Props) {
  const colors = useColors();
  const { addItem, removeItem, hasItems } = useInventory();
  const [clickedObjects, setClickedObjects] = useState<Set<string>>(new Set());

  const handleObjectPress = async (object: InteractiveObject) => {
    // Check if object is active
    if (object.isActive === false) {
      return;
    }

    // Check if one-time only and already clicked
    if (object.oneTimeOnly && clickedObjects.has(object.id)) {
      return;
    }

    // Check required items
    if (object.requiredItems && object.requiredItems.length > 0) {
      if (!hasItems(object.requiredItems)) {
        Alert.alert('Required Items', 'You need certain items to interact with this.');
        return;
      }
    }

    // Mark as clicked if one-time only
    if (object.oneTimeOnly) {
      setClickedObjects((prev) => new Set(prev).add(object.id));
    }

    // Execute actions
    for (const action of object.actions) {
      await executeAction(action);
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

      case 'add_item':
        const added = await addItem(action.item);
        if (added && action.showNotification) {
          Alert.alert(
            'Item Acquired',
            `You obtained: ${action.item.name}`,
            [{ text: 'OK' }]
          );
        }
        break;

      case 'remove_item':
        await removeItem(action.itemId);
        break;

      case 'show_image':
        onShowImage?.(action.imageUri, action.duration);
        break;

      case 'trigger_event':
        onEvent?.(action.eventId, action.data);
        break;
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
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
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Pulse animation
  useEffect(() => {
    if (object.pulseAnimation && !isClicked) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [object.pulseAnimation, isClicked]);

  // Glow animation
  useEffect(() => {
    if (object.glowColor && !isClicked) {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      glow.start();
      return () => glow.stop();
    }
  }, [object.glowColor, isClicked]);

  // Don't render if one-time and already clicked
  if (object.oneTimeOnly && isClicked) {
    return null;
  }

  // Calculate absolute position
  const left = (object.position.x / 100) * screenWidth;
  const top = (object.position.y / 100) * screenHeight;
  const width = (object.position.width / 100) * screenWidth;
  const height = (object.position.height / 100) * screenHeight;

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
          <Image
            source={{ uri: object.imageUri }}
            style={styles.objectImage}
            resizeMode="contain"
          />
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
