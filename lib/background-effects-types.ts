/**
 * Background Effects Types
 * Types for animated background effects
 */

// ── Effect Types ──────────────────────────────────────────────────────────

export type BackgroundEffectType =
  | 'sunrays' // Солнечные лучи
  | 'rain' // Дождь
  | 'snow' // Снег
  | 'fog' // Туман
  | 'storm' // Гроза (молнии)
  | 'particles' // Частицы (листья, пепел, etc)
  | 'clouds' // Облака
  | 'sparkles'; // Блестки/искры

// ── Effect Configuration ──────────────────────────────────────────────────

export interface BackgroundEffect {
  id: string;
  type: BackgroundEffectType;
  intensity: number; // 0.0 - 1.0 (слабый - сильный)
  speed: number; // 0.0 - 2.0 (медленный - быстрый)
  color?: string; // Цвет эффекта (опционально)
  opacity?: number; // 0.0 - 1.0
  enabled: boolean;
}

// ── Sunrays Effect ────────────────────────────────────────────────────────

export interface SunraysEffectConfig {
  type: 'sunrays';
  rayCount: number; // Количество лучей (4-12)
  color: string; // Цвет лучей
  opacity: number; // Прозрачность
  rotationSpeed: number; // Скорость вращения
  spread: number; // Разброс лучей (0-1)
}

// ── Rain Effect ───────────────────────────────────────────────────────────

export interface RainEffectConfig {
  type: 'rain';
  dropCount: number; // Количество капель (50-200)
  speed: number; // Скорость падения
  angle: number; // Угол падения (-30 до 30)
  opacity: number;
  color: string;
}

// ── Snow Effect ───────────────────────────────────────────────────────────

export interface SnowEffectConfig {
  type: 'snow';
  flakeCount: number; // Количество снежинок (30-150)
  speed: number; // Скорость падения
  windSpeed: number; // Скорость ветра (горизонтальное движение)
  opacity: number;
  minSize: number; // Минимальный размер
  maxSize: number; // Максимальный размер
}

// ── Fog Effect ────────────────────────────────────────────────────────────

export interface FogEffectConfig {
  type: 'fog';
  layerCount: number; // Количество слоев тумана (2-5)
  speed: number; // Скорость движения
  opacity: number;
  color: string;
  density: number; // Плотность (0-1)
}

// ── Storm Effect ──────────────────────────────────────────────────────────

export interface StormEffectConfig {
  type: 'storm';
  lightningFrequency: number; // Частота молний (секунды между вспышками)
  flashDuration: number; // Длительность вспышки (мс)
  flashIntensity: number; // Интенсивность вспышки (0-1)
  color: string; // Цвет молнии
}

// ── Particles Effect ──────────────────────────────────────────────────────

export interface ParticlesEffectConfig {
  type: 'particles';
  particleCount: number; // Количество частиц (20-100)
  speed: number; // Скорость движения
  direction: number; // Направление (0-360 градусов)
  opacity: number;
  minSize: number;
  maxSize: number;
  color: string;
  particleType: 'circle' | 'leaf' | 'ash' | 'petal'; // Тип частицы
}

// ── Clouds Effect ─────────────────────────────────────────────────────────

export interface CloudsEffectConfig {
  type: 'clouds';
  cloudCount: number; // Количество облаков (3-8)
  speed: number; // Скорость движения
  opacity: number;
  color: string;
  minSize: number;
  maxSize: number;
}

// ── Sparkles Effect ───────────────────────────────────────────────────────

export interface SparklesEffectConfig {
  type: 'sparkles';
  sparkleCount: number; // Количество блесток (20-80)
  twinkleSpeed: number; // Скорость мерцания
  opacity: number;
  color: string;
  size: number;
}

// ── Union Type ────────────────────────────────────────────────────────────

export type EffectConfig =
  | SunraysEffectConfig
  | RainEffectConfig
  | SnowEffectConfig
  | FogEffectConfig
  | StormEffectConfig
  | ParticlesEffectConfig
  | CloudsEffectConfig
  | SparklesEffectConfig;

// ── Scene Integration ─────────────────────────────────────────────────────

export interface SceneWithEffects {
  id: string;
  backgroundEffects?: BackgroundEffect[];
  // ... other scene properties
}

// ── Presets ───────────────────────────────────────────────────────────────

export interface EffectPreset {
  id: string;
  name: string;
  description: string;
  effects: BackgroundEffect[];
}

// Default presets
export const EFFECT_PRESETS: EffectPreset[] = [
  {
    id: 'sunny_day',
    name: 'Sunny Day',
    description: 'Солнечный день с лучами',
    effects: [
      {
        id: 'sunrays_1',
        type: 'sunrays',
        intensity: 0.6,
        speed: 0.3,
        opacity: 0.4,
        enabled: true,
      },
    ],
  },
  {
    id: 'rainy_day',
    name: 'Rainy Day',
    description: 'Дождливый день',
    effects: [
      {
        id: 'rain_1',
        type: 'rain',
        intensity: 0.7,
        speed: 1.2,
        opacity: 0.6,
        enabled: true,
      },
      {
        id: 'fog_1',
        type: 'fog',
        intensity: 0.3,
        speed: 0.2,
        opacity: 0.3,
        enabled: true,
      },
    ],
  },
  {
    id: 'snowy_day',
    name: 'Snowy Day',
    description: 'Снежный день',
    effects: [
      {
        id: 'snow_1',
        type: 'snow',
        intensity: 0.6,
        speed: 0.5,
        opacity: 0.7,
        enabled: true,
      },
    ],
  },
  {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    description: 'Гроза с молниями',
    effects: [
      {
        id: 'rain_2',
        type: 'rain',
        intensity: 0.9,
        speed: 1.5,
        opacity: 0.7,
        enabled: true,
      },
      {
        id: 'storm_1',
        type: 'storm',
        intensity: 0.8,
        speed: 1.0,
        opacity: 1.0,
        enabled: true,
      },
    ],
  },
  {
    id: 'foggy_morning',
    name: 'Foggy Morning',
    description: 'Туманное утро',
    effects: [
      {
        id: 'fog_2',
        type: 'fog',
        intensity: 0.7,
        speed: 0.3,
        opacity: 0.5,
        enabled: true,
      },
    ],
  },
  {
    id: 'magical_sparkles',
    name: 'Magical Sparkles',
    description: 'Магические искры',
    effects: [
      {
        id: 'sparkles_1',
        type: 'sparkles',
        intensity: 0.6,
        speed: 0.8,
        opacity: 0.6,
        color: '#FFD700',
        enabled: true,
      },
    ],
  },
  {
    id: 'autumn_leaves',
    name: 'Autumn Leaves',
    description: 'Падающие осенние листья',
    effects: [
      {
        id: 'particles_1',
        type: 'particles',
        intensity: 0.5,
        speed: 0.6,
        opacity: 0.7,
        color: '#D2691E',
        enabled: true,
      },
    ],
  },
];
