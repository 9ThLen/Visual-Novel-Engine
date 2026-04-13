/**
 * Storm Effect Component
 * Animated lightning/storm background effect
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface Props {
  intensity: number; // 0-1
  speed: number; // 0-2
  opacity: number; // 0-1
  color?: string;
}

export function StormEffect({ intensity, speed, opacity, color = '#FFFFFF' }: Props) {
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    const frequency = 3000 - speed * 1500; // 1500-3000ms between flashes
    const flashDuration = 100 + intensity * 200; // 100-300ms flash duration

    const triggerFlash = () => {
      setIsFlashing(true);

      // Main flash
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: intensity,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
        // Secondary flash (sometimes)
        ...(Math.random() > 0.5
          ? [
              Animated.delay(100),
              Animated.timing(flashAnim, {
                toValue: intensity * 0.6,
                duration: 50,
                useNativeDriver: true,
              }),
              Animated.timing(flashAnim, {
                toValue: 0,
                duration: 80,
                useNativeDriver: true,
              }),
            ]
          : []),
      ]).start(() => {
        setIsFlashing(false);
      });
    };

    const interval = setInterval(() => {
      if (!isFlashing) {
        triggerFlash();
      }
    }, frequency);

    return () => clearInterval(interval);
  }, [intensity, speed, isFlashing]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: color,
          opacity: Animated.multiply(flashAnim, opacity),
        },
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
