/**
 * Rain Effect Component
 * Animated rain background effect
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';

interface Props {
  intensity: number; // 0-1
  speed: number; // 0-2
  opacity: number; // 0-1
  color?: string;
}

interface RainDrop {
  id: number;
  x: number;
  length: number;
  animatedY: Animated.Value;
  delay: number;
}

export function RainEffect({ intensity, speed, opacity, color = '#A0C4FF' }: Props) {
  const { width, height } = useWindowDimensions();
  const dropsRef = useRef<RainDrop[]>([]);

  const dropCount = Math.round(50 + intensity * 150); // 50-200 drops

  useEffect(() => {
    // Initialize drops
    dropsRef.current = Array.from({ length: dropCount }, (_, i) => ({
      id: i,
      x: Math.random() * width,
      length: 20 + Math.random() * 30,
      animatedY: new Animated.Value(-50),
      delay: Math.random() * 2000,
    }));

    // Animate drops
    const animations = dropsRef.current.map((drop) => {
      const duration = (2000 - speed * 800) / (0.5 + Math.random() * 0.5);

      return Animated.loop(
        Animated.sequence([
          Animated.delay(drop.delay),
          Animated.timing(drop.animatedY, {
            toValue: height + 50,
            duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      );
    });

    animations.forEach((anim) => anim.start());

    return () => {
      animations.forEach((anim) => anim.stop());
    };
  }, [dropCount, speed, width, height]);

  return (
    <View style={styles.container} pointerEvents="none">
      {dropsRef.current.map((drop) => (
        <Animated.View
          key={drop.id}
          style={[
            styles.drop,
            {
              left: drop.x,
              height: drop.length,
              backgroundColor: color,
              opacity: opacity * (0.3 + Math.random() * 0.4),
              transform: [{ translateY: drop.animatedY }, { rotate: '10deg' }],
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
  drop: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
  },
});
