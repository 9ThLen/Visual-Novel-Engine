/**
 * Sunrays Effect Component
 * Animated sunrays background effect
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

interface Props {
  intensity: number; // 0-1
  speed: number; // 0-2
  opacity: number; // 0-1
  color?: string;
}

export function SunraysEffect({ intensity, speed, opacity, color = '#FFD700' }: Props) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = 60000 / Math.max(0.1, speed); // 60 seconds at speed 1.0

    const animation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => animation.stop();
  }, [speed]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const rayCount = Math.round(4 + intensity * 8); // 4-12 rays
  const rays = Array.from({ length: rayCount }, (_, i) => i);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ rotate: rotation }],
        },
      ]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%" viewBox="0 0 400 400" style={styles.svg}>
        <Defs>
          <LinearGradient id="rayGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={color} stopOpacity="0" />
            <Stop offset="50%" stopColor={color} stopOpacity={intensity * 0.6} />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {rays.map((i) => {
          const angle = (360 / rayCount) * i;
          const spread = 15 + intensity * 10; // Ray width
          return (
            <Path
              key={i}
              d={`M 200 200 L ${200 + Math.cos((angle - spread / 2) * (Math.PI / 180)) * 300} ${
                200 + Math.sin((angle - spread / 2) * (Math.PI / 180)) * 300
              } L ${200 + Math.cos((angle + spread / 2) * (Math.PI / 180)) * 300} ${
                200 + Math.sin((angle + spread / 2) * (Math.PI / 180)) * 300
              } Z`}
              fill="url(#rayGradient)"
            />
          );
        })}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
  },
});
