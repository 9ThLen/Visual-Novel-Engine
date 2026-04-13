/**
 * Snow Effect Component
 * Animated snow background effect
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';

interface Props {
  intensity: number; // 0-1
  speed: number; // 0-2
  opacity: number; // 0-1
}

interface Snowflake {
  id: number;
  animatedX: Animated.Value;
  animatedY: Animated.Value;
  size: number;
  delay: number;
  swingOffset: number;
}

export function SnowEffect({ intensity, speed, opacity }: Props) {
  const { width, height } = useWindowDimensions();
  const flakesRef = useRef<Snowflake[]>([]);

  const flakeCount = Math.round(30 + intensity * 120); // 30-150 flakes

  useEffect(() => {
    // Initialize snowflakes
    flakesRef.current = Array.from({ length: flakeCount }, (_, i) => ({
      id: i,
      animatedX: new Animated.Value(Math.random() * width),
      animatedY: new Animated.Value(-20),
      size: 3 + Math.random() * 5,
      delay: Math.random() * 3000,
      swingOffset: Math.random() * 50 - 25,
    }));

    // Animate snowflakes
    const animations = flakesRef.current.map((flake) => {
      const fallDuration = (3000 - speed * 1000) / (0.5 + Math.random() * 0.5);
      const swingDuration = 2000 + Math.random() * 2000;

      const fallAnim = Animated.loop(
        Animated.sequence([
          Animated.delay(flake.delay),
          Animated.timing(flake.animatedY, {
            toValue: height + 20,
            duration: fallDuration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      );

      const swingAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(flake.animatedX, {
            toValue: (flake.animatedX as any)._value + flake.swingOffset,
            duration: swingDuration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(flake.animatedX, {
            toValue: (flake.animatedX as any)._value,
            duration: swingDuration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      return { fallAnim, swingAnim };
    });

    animations.forEach(({ fallAnim, swingAnim }) => {
      fallAnim.start();
      swingAnim.start();
    });

    return () => {
      animations.forEach(({ fallAnim, swingAnim }) => {
        fallAnim.stop();
        swingAnim.stop();
      });
    };
  }, [flakeCount, speed, width, height]);

  return (
    <View style={styles.container} pointerEvents="none">
      {flakesRef.current.map((flake) => (
        <Animated.View
          key={flake.id}
          style={[
            styles.flake,
            {
              width: flake.size,
              height: flake.size,
              opacity: opacity * (0.5 + Math.random() * 0.5),
              transform: [{ translateX: flake.animatedX }, { translateY: flake.animatedY }],
            },
          ]}
        />
      ))}
    </View>
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
  flake: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 100,
  },
});
