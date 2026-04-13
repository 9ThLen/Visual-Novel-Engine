/**
 * UI Transition Manager
 * Manages UI hide/show transitions for splash screens
 */

import { Animated, Easing } from 'react-native';
import type { UITransition } from '@/lib/splash-types';

export class UITransitionManager {
  private uiOpacity: Animated.Value;
  private uiTranslateY: Animated.Value;

  constructor() {
    this.uiOpacity = new Animated.Value(1);
    this.uiTranslateY = new Animated.Value(0);
  }

  getAnimatedStyle() {
    return {
      opacity: this.uiOpacity,
      transform: [{ translateY: this.uiTranslateY }],
    };
  }

  hideUI(transition?: UITransition): Promise<void> {
    return new Promise((resolve) => {
      const duration = transition?.duration || 600;
      const easing = this.getEasing(transition?.easing);

      if (transition?.type === 'slide') {
        Animated.parallel([
          Animated.timing(this.uiOpacity, {
            toValue: 0,
            duration: duration * 0.8,
            easing,
            useNativeDriver: true,
          }),
          Animated.timing(this.uiTranslateY, {
            toValue: 100,
            duration,
            easing,
            useNativeDriver: true,
          }),
        ]).start(() => resolve());
      } else {
        // Fade
        Animated.timing(this.uiOpacity, {
          toValue: 0,
          duration,
          easing,
          useNativeDriver: true,
        }).start(() => resolve());
      }
    });
  }

  showUI(transition?: UITransition): Promise<void> {
    return new Promise((resolve) => {
      const duration = transition?.duration || 800;
      const easing = this.getEasing(transition?.easing);

      if (transition?.type === 'slide') {
        Animated.parallel([
          Animated.timing(this.uiOpacity, {
            toValue: 1,
            duration: duration * 0.8,
            easing,
            useNativeDriver: true,
          }),
          Animated.timing(this.uiTranslateY, {
            toValue: 0,
            duration,
            easing,
            useNativeDriver: true,
          }),
        ]).start(() => resolve());
      } else {
        // Fade
        Animated.timing(this.uiOpacity, {
          toValue: 1,
          duration,
          easing,
          useNativeDriver: true,
        }).start(() => resolve());
      }
    });
  }

  reset() {
    this.uiOpacity.setValue(1);
    this.uiTranslateY.setValue(0);
  }

  private getEasing(type?: string) {
    switch (type) {
      case 'linear':
        return Easing.linear;
      case 'ease-in':
        return Easing.in(Easing.ease);
      case 'ease-out':
        return Easing.out(Easing.ease);
      case 'ease-in-out':
        return Easing.inOut(Easing.ease);
      case 'ease':
      default:
        return Easing.ease;
    }
  }
}
