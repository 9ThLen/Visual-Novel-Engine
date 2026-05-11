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
  startX: number;
  animatedX: Animated.Value;
  animatedY: Animated.Value;
  animatedRotate: Animated.Value;
  size: number;
  delay: number;
  randomOpacity: number;
}

export function ParticlesEffect({
  intensity,
  speed,
  opacity,
  color = '#D2691E',
  particleType = 'leaf',
}: Props) {
  const { width, height } = useWindowDimensions();

  const particleCount = Math.round(20 + intensity * 80); // 20-100 particles

  // Initialize particles during render so the first frame is not empty
  const particles = React.useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => {
      const startX = Math.random() * width;
      return {
        id: i,
        startX,
        animatedX: new Animated.Value(startX),
        animatedY: new Animated.Value(-20),
        animatedRotate: new Animated.Value(0),
        size: 5 + Math.random() * 10,
        delay: Math.random() * 4000,
        randomOpacity: 0.5 + Math.random() * 0.5,
      };
    });
  }, [particleCount, width]);

  const speedRef = useRef(speed);
  const heightRef = useRef(height);
  const activeRef = useRef(true);

  useEffect(() => {
    speedRef.current = speed;
    heightRef.current = height;
  }, [speed, height]);

  useEffect(() => {
    activeRef.current = true;

    particles.forEach((particle) => {
      const runIteration = () => {
        if (!activeRef.current) return;

        const currentSpeed = speedRef.current;
        const currentHeight = heightRef.current;
        
        // Fix: Ensure fallDuration is always positive even if speed > 2.66
        const baseDuration = Math.max(500, 4000 - currentSpeed * 1500);
        const fallDuration = baseDuration / (0.5 + Math.random() * 0.5);
        const swingAmount = 30 + Math.random() * 40;
        const rotateDuration = 1000 + Math.random() * 2000;

        // Reset positions for next iteration
        particle.animatedY.setValue(-20);
        particle.animatedX.setValue(particle.startX);
        particle.animatedRotate.setValue(0);

        Animated.parallel([
          Animated.timing(particle.animatedY, {
            toValue: currentHeight + 20,
            duration: fallDuration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(particle.animatedX, {
              toValue: particle.startX + swingAmount,
              duration: fallDuration / 2,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(particle.animatedX, {
              toValue: particle.startX,
              duration: fallDuration / 2,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(particle.animatedRotate, {
            toValue: 1,
            duration: rotateDuration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (activeRef.current) {
            runIteration();
          }
        });
      };

      // Start with initial delay
      const timeoutId = setTimeout(runIteration, particle.delay);
      return () => clearTimeout(timeoutId);
    });

    return () => {
      activeRef.current = false;
    };
  }, [particles]);

  const getParticleStyle = (particle: Particle) => {
    const rotation = particle.animatedRotate.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    const baseStyle = {
      width: particle.size,
      height: particle.size,
      opacity: opacity * particle.randomOpacity,
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
      {particles.map((particle) => (
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
