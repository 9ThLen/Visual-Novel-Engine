/**
 * Fog Effect Component
 * Animated fog background effect
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';

interface Props {
  intensity: number; // 0-1
  speed: number; // 0-2
  opacity: number; // 0-1
  color?: string;
}

interface FogLayer {
  id: number;
  animatedX: Animated.Value;
  yPosition: number;
  scale: number;
  delay: number;
}

export function FogEffect({ intensity, speed, opacity, color = '#E0E0E0' }: Props) {
  const { width, height } = useWindowDimensions();
  const layersRef = useRef<FogLayer[]>([]);

  const layerCount = Math.round(2 + intensity * 3); // 2-5 layers

  useEffect(() => {
    // Initialize fog layers
    layersRef.current = Array.from({ length: layerCount }, (_, i) => ({
      id: i,
      animatedX: new Animated.Value(-width),
      yPosition: (height / layerCount) * i,
      scale: 1 + i * 0.2,
      delay: i * 1000,
    }));

    // Animate fog layers
    const animations = layersRef.current.map((layer) => {
      const duration = (15000 - speed * 5000) / (0.5 + Math.random() * 0.5);

      return Animated.loop(
        Animated.sequence([
          Animated.delay(layer.delay),
          Animated.timing(layer.animatedX, {
            toValue: width,
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
  }, [layerCount, speed, width, height]);

  return (
    <View style={styles.container} pointerEvents="none">
      {layersRef.current.map((layer, index) => (
        <Animated.View
          key={layer.id}
          style={[
            styles.layer,
            {
              top: layer.yPosition,
              backgroundColor: color,
              opacity: opacity * (0.3 + (index / layerCount) * 0.4),
              transform: [{ translateX: layer.animatedX }, { scale: layer.scale }],
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
  layer: {
    position: 'absolute',
    width: '200%',
    height: 200,
    borderRadius: 100,
  },
});
