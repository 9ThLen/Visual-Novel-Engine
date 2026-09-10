export type EffectTarget = 'screen' | 'character' | 'background';
export type RainEffectVariant = 'rain' | 'storm' | 'drizzle' | 'fallout';
export type FogEffectVariant = 'light' | 'dense';

export interface RainEffectOptions {
  variant?: RainEffectVariant;
  color?: string;
  opacity?: number;
  density?: number;
  speed?: number;
  wind?: number;
  angle?: number;
  dropLength?: number;
  dropWidth?: number;
  splash?: boolean;
  lightning?: boolean;
  // Ambient rain loop + thunder (thunder only when lightning is on).
  // undefined = enabled; explicit false disables.
  sound?: boolean;
  soundVolume?: number;
}

export interface SnowEffectOptions {
  color?: string;
  snowflakeCount?: number;
  radius?: [number, number];
  speed?: [number, number];
  wind?: [number, number];
  changeFrequency?: number;
  rotationSpeed?: [number, number];
  opacity?: [number, number];
  enable3DRotation?: boolean;
  imageUris?: string[];
}

export interface FogEffectOptions {
  variant?: FogEffectVariant;
}
