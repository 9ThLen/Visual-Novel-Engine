/**
 * Particles Effect Component
 * Animated particles (leaves, petals, ash, etc.)
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';

interface Props {
  intensity: number; // 0-1
  speed: number; // 0-2
  opacity: number; // 0-1
  color?: string;
  particleType?: 'circle' | 'leaf' | 'ash' | 'petal';
}

interface Particle {
  id: number;
  animatedX: Animated.Value;
  animatedY: Animated.Value;
  animatedRotate: Animated.Value;
  size: number;
  delay: number;
}

export function ParticlesEffect({
  intensity,
  speed,
  opacity,
  color = '#D2691E',
  particleType = 'leaf',
}: Props) {
  const { width, height } = useWindowDimensions();
  const particlesRef = useRef<Particle[]>([]);

  const particleCount = Math.round(20 + intensity * 80); // 20-100 particles

  useEffect(() => {
    // Initialize particles
    particlesRef.current = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      animatedX: new Animated.Value(Math.random() * width),
      animatedY: new Animated.Value(-20),
      animatedRotate: new Animated.Value(0),
      size: 5 + Math.random() * 10,
      delay: Math.random() * 4000,
    }));

    // Animate particles
    const animations = particlesRef.current.map((particle) => {
      const fallDuration = (4000 - speed * 1500) / (0.5 + Math.random() * 0.5);
      const swingAmount = 30 + Math.random() * 40;
      const rotateDuration = 1000 + Math.random() * 2000;

      const fallAnim = Animated.loop(
        Animated.sequence([
          Animated.delay(particle.delay),
          Animated.parallel([
            Animated.timing(particle.animatedY, {
              toValue: height + 20,
              duration: fallDuration,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(particle.animatedX, {
                toValue: (particle.animatedX as any)._value + swingAmount,
                duration: fallDuration / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(particle.animatedX, {
                toValue: (particle.animatedX as any)._value,
                duration: fallDuration / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
          ]),
        ])
      );

      const rotateAnim = Animated.loop(
        Animated.timing(particle.animatedRotate, {
          toValue: 1,
          duration: rotateDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      return { fallAnim, rotateAnim };
    });

    animations.forEach(({ fallAnim, rotateAnim }) => {
      fallAnim.start();
      rotateAnim.start();
    });

    return () => {
      animations.forEach(({ fallAnim, rotateAnim }) => {
        fallAnim.stop();
        rotateAnim.stop();
      });
    };
  }, [particleCount, speed, width, height]);

  const getParticleStyle = (particle: Particle) => {
    const rotation = particle.animatedRotate.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    const baseStyle = {
      width: particle.size,
      height: particle.size,
      opacity: opacity * (0.5 + Math.random() * 0.5),
      transform: [
        { translateX: particle.animatedX },
        { translateY: particle.animatedY },
        { rotate: rotation },
      ],
    };

    switch (particleType) {
      case 'leaf':
        return {
          ...baseStyle,
          backgroundColor: color,
          borderRadius: particle.size / 2,
          borderTopLeftRadius: 0,
        };
      case 'petal':
        return {
          ...baseStyle,
          backgroundColor: color,
          borderRadius: particle.size,
        };
      case 'ash':
        return {
          ...baseStyle,
          backgroundColor: color,
          borderRadius: 1,
        };
      case 'circle':
      default:
        return {
          ...baseStyle,
          backgroundColor: color,
          borderRadius: particle.size / 2,
        };
    }
  };

  return (
    <View style={styles.container} pointerEvents="none">
      {particlesRef.current.map((particle) => (
        <Animated.View key={particle.id} style={[styles.particle, getParticleStyle(particle)]} />
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
  particle: {
    position: 'absolute',
  },
});
