/**
 * Splash Screen and Animated Background Types
 * Types for fullscreen splash screens and animated backgrounds
 */

// ── Splash Screen ─────────────────────────────────────────────────────────

export interface SplashScreen {
  id: string;
  type: 'image' | 'video' | 'animation';
  uri: string; // Image, video, or animation file
  duration: number; // Duration in milliseconds
  fadeIn?: number; // Fade in duration (ms)
  fadeOut?: number; // Fade out duration (ms)
  showBefore?: boolean; // Show before scene content (true) or after (false)
  pauseOnSplash?: boolean; // Pause story progression during splash
}

// ── Animated Background ───────────────────────────────────────────────────

export type BackgroundType = 'static' | 'video' | 'animated';

export interface AnimatedBackground {
  id: string;
  type: BackgroundType;
  uri: string;
  loop?: boolean; // For video/animation
  playbackRate?: number; // Speed multiplier (0.5 - 2.0)
  opacity?: number; // 0.0 - 1.0
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
}

// ── UI Transition ─────────────────────────────────────────────────────────

export interface UITransition {
  type: 'fade' | 'slide';
  duration: number; // milliseconds
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface SplashScreenConfig {
  splash?: SplashScreen;
  uiHideTransition?: UITransition; // How UI hides
  uiShowTransition?: UITransition; // How UI comes back
}

// ── Scene with Splash ─────────────────────────────────────────────────────

export interface SceneWithSplash {
  id: string;
  text: string;
  background: AnimatedBackground; // Can be static, video, or animated
  splashScreen?: SplashScreenConfig;
  // ... other properties
}

// ── Splash Presets ────────────────────────────────────────────────────────

export interface SplashPreset {
  id: string;
  name: string;
  description: string;
  config: SplashScreenConfig;
}

export const SPLASH_PRESETS: SplashPreset[] = [
  {
    id: 'dramatic_reveal',
    name: 'Dramatic Reveal',
    description: 'Медленное появление заставки с затуханием UI',
    config: {
      splash: {
        id: 'splash_1',
        type: 'image',
        uri: '',
        duration: 3000,
        fadeIn: 800,
        fadeOut: 800,
        showBefore: false,
        pauseOnSplash: true,
      },
      uiHideTransition: {
        type: 'fade',
        duration: 600,
        easing: 'ease-out',
      },
      uiShowTransition: {
        type: 'fade',
        duration: 800,
        easing: 'ease-in',
      },
    },
  },
  {
    id: 'quick_flash',
    name: 'Quick Flash',
    description: 'Быстрая вспышка заставки',
    config: {
      splash: {
        id: 'splash_2',
        type: 'image',
        uri: '',
        duration: 1500,
        fadeIn: 200,
        fadeOut: 200,
        showBefore: false,
        pauseOnSplash: false,
      },
      uiHideTransition: {
        type: 'fade',
        duration: 300,
        easing: 'ease-out',
      },
      uiShowTransition: {
        type: 'fade',
        duration: 400,
        easing: 'ease-in',
      },
    },
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Кинематографическая заставка с медленным переходом',
    config: {
      splash: {
        id: 'splash_3',
        type: 'video',
        uri: '',
        duration: 5000,
        fadeIn: 1000,
        fadeOut: 1000,
        showBefore: true,
        pauseOnSplash: true,
      },
      uiHideTransition: {
        type: 'slide',
        duration: 800,
        easing: 'ease-in-out',
      },
      uiShowTransition: {
        type: 'slide',
        duration: 1000,
        easing: 'ease-in-out',
      },
    },
  },
  {
    id: 'emotional_moment',
    name: 'Emotional Moment',
    description: 'Эмоциональный момент с паузой',
    config: {
      splash: {
        id: 'splash_4',
        type: 'image',
        uri: '',
        duration: 4000,
        fadeIn: 1200,
        fadeOut: 1200,
        showBefore: false,
        pauseOnSplash: true,
      },
      uiHideTransition: {
        type: 'fade',
        duration: 1000,
        easing: 'ease-out',
      },
      uiShowTransition: {
        type: 'fade',
        duration: 1200,
        easing: 'ease-in',
      },
    },
  },
];

// ── Video Background Config ───────────────────────────────────────────────

export interface VideoBackgroundConfig {
  uri: string;
  loop: boolean;
  playbackRate: number; // 0.5 - 2.0
  volume: number; // 0.0 - 1.0
  opacity: number; // 0.0 - 1.0
  resizeMode: 'cover' | 'contain' | 'stretch';
}
