/**
 * HelpModeToggle Component
 * Button to toggle help mode on/off
 */

import React, { useRef, useEffect } from 'react';
import { Pressable, Text, StyleSheet, Animated } from 'react-native';
import { useHelpSystem } from '@/lib/help-system-context';
import { useColors } from '@/hooks/use-colors';
import { buttonFeedback } from '@/lib/ui-feedback';

interface HelpModeToggleProps {
  style?: any;
}

export function HelpModeToggle({ style }: HelpModeToggleProps) {
  const { isHelpModeActive, isGuidedTourActive, toggleHelpMode } = useHelpSystem();
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation when help mode is active
  useEffect(() => {
    if (isHelpModeActive) {
      Animated.loop(
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
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isHelpModeActive]);

  // Rotate animation on toggle
  const handlePress = () => {
    buttonFeedback();

    Animated.sequence([
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start();

    toggleHelpMode();
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Don't show toggle during guided tour
  if (isGuidedTourActive) return null;

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale: pulseAnim }, { rotate: rotation }],
        },
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: isHelpModeActive ? colors.primary : colors.surface,
            borderColor: isHelpModeActive ? colors.primary : colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.icon,
            { color: isHelpModeActive ? '#fff' : colors.foreground },
          ]}
        >
          ?
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: {
    fontSize: 24,
    fontWeight: '700',
  },
});
