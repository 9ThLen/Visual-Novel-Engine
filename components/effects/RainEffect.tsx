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
  randomOpacity: number;
}

const RainDropItem = React.memo(({ drop, color, opacity }: { drop: RainDrop; color: string; opacity: number }) => {
  return (
    <Animated.View
      style={[
        styles.drop,
        {
          left: drop.x,
          height: drop.length,
          backgroundColor: color,
          opacity: opacity * drop.randomOpacity,
          transform: [{ translateY: drop.animatedY }, { rotate: '10deg' }],
        },
      ]}
    />
  );
});

export function RainEffect({ intensity, speed, opacity, color = '#A0C4FF' }: Props) {
  const { width, height } = useWindowDimensions();
  const speedRef = useRef(speed);
  const heightRef = useRef(height);
  const activeRef = useRef(true);

  const dropCount = Math.round(50 + intensity * 150); // 50-200 drops

  const drops = React.useMemo(() => {
    return Array.from({ length: dropCount }, (_, i) => ({
      id: i,
      x: Math.random() * width,
      length: 20 + Math.random() * 30,
      animatedY: new Animated.Value(-50),
      delay: Math.random() * 2000,
      randomOpacity: 0.3 + Math.random() * 0.4,
    }));
  }, [dropCount, width]);

  useEffect(() => {
    speedRef.current = speed;
    heightRef.current = height;
  }, [speed, height]);

  useEffect(() => {
    activeRef.current = true;

    drops.forEach((drop) => {
      const runIteration = () => {
        if (!activeRef.current) return;

        const currentSpeed = speedRef.current;
        const currentHeight = heightRef.current;
        const duration = (2000 - currentSpeed * 800) / (0.5 + Math.random() * 0.5);

        drop.animatedY.setValue(-50);

        Animated.timing(drop.animatedY, {
          toValue: currentHeight + 50,
          duration: Math.max(300, duration),
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(() => {
          if (activeRef.current) {
            runIteration();
          }
        });
      };

      const timeoutId = setTimeout(runIteration, drop.delay);
      return () => clearTimeout(timeoutId);
    });

    return () => {
      activeRef.current = false;
    };
  }, [drops]);

  return (
    <View style={styles.container} pointerEvents="none">
      {drops.map((drop) => (
        <RainDropItem key={drop.id} drop={drop} color={color} opacity={opacity} />
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
