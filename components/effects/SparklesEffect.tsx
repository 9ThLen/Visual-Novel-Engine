/**
 * Sparkles Effect Component
 * Animated sparkles/twinkles background effect
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';

interface Props {
  intensity: number; // 0-1
  speed: number; // 0-2
  opacity: number; // 0-1
  color?: string;
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  animatedOpacity: Animated.Value;
  animatedScale: Animated.Value;
  size: number;
  delay: number;
}

export function SparklesEffect({ intensity, speed, opacity, color = '#FFD700' }: Props) {
  const { width, height } = useWindowDimensions();
  const sparklesRef = useRef<Sparkle[]>([]);

  const sparkleCount = Math.round(20 + intensity * 60); // 20-80 sparkles

  useEffect(() => {
    // Initialize sparkles
    sparklesRef.current = Array.from({ length: sparkleCount }, (_, i) => ({
      id: i,
      x: Math.random() * width,
      y: Math.random() * height,
      animatedOpacity: new Animated.Value(0),
      animatedScale: new Animated.Value(0),
      size: 3 + Math.random() * 5,
      delay: Math.random() * 2000,
    }));

    // Animate sparkles (twinkle effect)
    const animations = sparklesRef.current.map((sparkle) => {
      const twinkleDuration = (1000 - speed * 300) / (0.5 + Math.random() * 0.5);

      return Animated.loop(
        Animated.sequence([
          Animated.delay(sparkle.delay),
          Animated.parallel([
            Animated.timing(sparkle.animatedOpacity, {
              toValue: 1,
              duration: twinkleDuration / 2,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(sparkle.animatedScale, {
              toValue: 1,
              duration: twinkleDuration / 2,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(sparkle.animatedOpacity, {
              toValue: 0,
              duration: twinkleDuration / 2,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(sparkle.animatedScale, {
              toValue: 0,
              duration: twinkleDuration / 2,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(Math.random() * 1000),
        ])
      );
    });

    animations.forEach((anim) => anim.start());

    return () => {
      animations.forEach((anim) => anim.stop());
    };
  }, [sparkleCount, speed, width, height]);

  return (
    <View style={styles.container} pointerEvents="none">
      {sparklesRef.current.map((sparkle) => (
        <Animated.View
          key={sparkle.id}
          style={[
            styles.sparkle,
            {
              left: sparkle.x,
              top: sparkle.y,
              width: sparkle.size,
              height: sparkle.size,
              backgroundColor: color,
              opacity: Animated.multiply(sparkle.animatedOpacity, opacity),
              transform: [{ scale: sparkle.animatedScale }],
            },
          ]}
        >
          {/* Cross shape for sparkle */}
          <View style={[styles.sparkleBeam, { backgroundColor: color }]} />
          <View style={[styles.sparkleBeam, styles.sparkleBeamRotated, { backgroundColor: color }]} />
        </Animated.View>
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
  sparkle: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkleBeam: {
    position: 'absolute',
    width: '100%',
    height: '20%',
    borderRadius: 10,
  },
  sparkleBeamRotated: {
    transform: [{ rotate: '90deg' }],
  },
});
