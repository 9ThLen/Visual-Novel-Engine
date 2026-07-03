/* eslint-disable react/no-unknown-property */
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { gsap } from 'gsap';
import * as THREE from 'three';
import type { ActiveEffect } from '@/lib/engine/runtime-types';
import type { FogEffectVariant } from '@/lib/engine/effect-options';

const FOG_ELEMENT_URL = '/vendor/weather-effects/fog/fog-element.png';
const DENSE_FOG_ELEMENT_URL = '/vendor/weather-effects/fog/dense-fog-element.png';

interface FogSettings {
  count: number;
  fogElementRatio: number;
  alphaMin: number;
  alphaMax: number;
  scaleMin: number;
  scaleMax: number;
  moveSpeed: number;
}

interface FogSpriteState {
  texture: THREE.Texture;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  driftAmountX: number;
  driftAmountY: number;
  driftSpeedX: number;
  driftSpeedY: number;
  driftPhaseX: number;
  driftPhaseY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

function getSettings(effect: ActiveEffect): FogSettings {
  const intensity = clamp(effect.intensity, 0, 100);
  const variant: FogEffectVariant = effect.fog?.variant ?? (intensity >= 60 ? 'dense' : 'light');
  const dense = variant === 'dense';
  return dense
    ? {
      count: Math.round(clamp(24 + intensity * 0.28, 28, 56)),
      fogElementRatio: 0.35,
      alphaMin: 0.08,
      alphaMax: clamp(0.16 + intensity / 500, 0.18, 0.36),
      scaleMin: 1,
      scaleMax: 2.4,
      moveSpeed: 0.035,
    }
    : {
      count: Math.round(clamp(12 + intensity * 0.18, 14, 34)),
      fogElementRatio: 0.8,
      alphaMin: 0.12,
      alphaMax: clamp(0.18 + intensity / 650, 0.2, 0.34),
      scaleMin: 0.7,
      scaleMax: 1.8,
      moveSpeed: 0.02,
    };
}

function FogSprite({
  initial,
  windOffset,
}: {
  initial: FogSpriteState;
  windOffset: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const mesh = useRef<THREE.Mesh | null>(null);
  const visibleRef = useRef(false);

  useFrame((state) => {
    const current = mesh.current;
    if (!current) return;

    const t = state.clock.getElapsedTime();
    let x = initial.x + windOffset.current.x + Math.sin(t * initial.driftSpeedX + initial.driftPhaseX) * initial.driftAmountX;
    let y = initial.y + windOffset.current.y + Math.cos(t * initial.driftSpeedY + initial.driftPhaseY) * initial.driftAmountY;
    if (x > 1.1) x -= 2.2;
    if (x < -1.1) x += 2.2;
    if (y > 1.1) y -= 2.2;
    if (y < -1.1) y += 2.2;

    current.position.x = x;
    current.position.y = y;

    const isVisible = x > -1 && x < 1 && y > -1 && y < 1;
    const material = current.material as THREE.MeshBasicMaterial;
    if (isVisible && !visibleRef.current) {
      gsap.to(material, { opacity: initial.alpha, duration: 0.5, overwrite: true });
      visibleRef.current = true;
    } else if (!isVisible && visibleRef.current) {
      gsap.to(material, { opacity: 0, duration: 0.5, overwrite: true });
      visibleRef.current = false;
    }
  });

  return (
    <mesh ref={mesh} position={[initial.x, initial.y, 0]}>
      <planeGeometry args={[initial.scale, initial.scale]} />
      <meshBasicMaterial map={initial.texture} transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function FogWindController({
  windAngle,
  windOffset,
}: {
  windAngle: React.MutableRefObject<number>;
  windOffset: React.MutableRefObject<{ x: number; y: number }>;
}) {
  useFrame(() => {
    if (Math.random() > 0.995) {
      windAngle.current += (Math.random() - 0.5) * 0.2;
      if (windAngle.current > Math.PI) windAngle.current -= 2 * Math.PI;
      if (windAngle.current < -Math.PI) windAngle.current += 2 * Math.PI;
    }
    const windSpeed = 0.0007;
    windOffset.current.x += Math.cos(windAngle.current) * windSpeed;
    windOffset.current.y += Math.sin(windAngle.current) * windSpeed;
    if (windOffset.current.x > 1) windOffset.current.x -= 2;
    if (windOffset.current.x < -1) windOffset.current.x += 2;
    if (windOffset.current.y > 1) windOffset.current.y -= 2;
    if (windOffset.current.y < -1) windOffset.current.y += 2;
  });
  return null;
}

function FogCanvas({ effect }: { effect: ActiveEffect }) {
  const [fogElement, denseFogElement] = useLoader(THREE.TextureLoader, [
    FOG_ELEMENT_URL,
    DENSE_FOG_ELEMENT_URL,
  ]);
  const settings = useMemo(() => getSettings(effect), [effect]);
  const windAngle = useRef(0);
  const windOffset = useRef({ x: 0, y: 0 });

  const sprites = useMemo<FogSpriteState[]>(() => Array.from({ length: settings.count }, () => {
    const useFogElement = Math.random() < settings.fogElementRatio;
    const texture = useFogElement ? fogElement : denseFogElement;
    const scale = settings.scaleMin + Math.random() * (settings.scaleMax - settings.scaleMin);
    return {
      texture,
      x: (Math.random() - 0.5) * 2.2,
      y: (Math.random() - 0.5) * 2.2,
      scale,
      alpha: settings.alphaMin + Math.random() * (settings.alphaMax - settings.alphaMin),
      driftAmountX: 0.08 + Math.random() * 0.18,
      driftAmountY: 0.08 + Math.random() * 0.18,
      driftSpeedX: settings.moveSpeed * (0.7 + Math.random() * 0.6),
      driftSpeedY: settings.moveSpeed * (0.7 + Math.random() * 0.6),
      driftPhaseX: Math.random() * Math.PI * 2,
      driftPhaseY: Math.random() * Math.PI * 2,
    };
  }), [denseFogElement, fogElement, settings]);

  return (
    <Canvas
      camera={{ position: [0, 0, 1], fov: 75 }}
      gl={{ alpha: true, antialias: true }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <FogWindController windAngle={windAngle} windOffset={windOffset} />
      {sprites.map((sprite, index) => (
        <FogSprite key={index} initial={sprite} windOffset={windOffset} />
      ))}
    </Canvas>
  );
}

export function ReactWeatherFogEffect({ effect }: { effect: ActiveEffect }) {
  const canUseWebGL = useMemo(() => supportsWebGL(), []);
  const variant: FogEffectVariant = effect.fog?.variant ?? (effect.intensity >= 60 ? 'dense' : 'light');
  if (!canUseWebGL) {
    return (
      <div
        data-testid="react-weather-fog-effect"
        data-fog-variant={variant}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    );
  }

  return (
    <div
      data-testid="react-weather-fog-effect"
      data-fog-variant={variant}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <FogCanvas effect={effect} />
    </div>
  );
}
