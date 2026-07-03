import React, { useEffect, useMemo, useRef } from 'react';
import type { ActiveEffect } from '@/lib/engine/runtime-types';
import type { RainEffectVariant } from '@/lib/engine/effect-options';
import Raindrops from './react-weather-effects/rain/raindrops';
import { weatherData } from './react-weather-effects/rain/rain-utils';

type RainType = RainEffectVariant;

const DROP_ALPHA_URL = '/vendor/weather-effects/rain/drop-alpha.png';
const DROP_COLOR_URL = '/vendor/weather-effects/rain/drop-color.png';

interface RaindropsInstance {
  canvas?: HTMLCanvasElement;
  destroy?: () => void;
}

type RaindropsConstructor = new (
  width: number,
  height: number,
  scale: number,
  dropAlpha: HTMLImageElement,
  dropColor: HTMLImageElement,
  options: Record<string, unknown>,
) => RaindropsInstance;

const RaindropsClass = Raindrops as unknown as RaindropsConstructor;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function getRainType(effect: ActiveEffect): RainType {
  const rain = effect.rain ?? {};
  if (rain.variant && rain.variant in weatherData) return rain.variant;
  if (rain.lightning) return 'storm';
  const density = rain.density ?? 24 + effect.intensity * 1.8;
  if (density < 40 || effect.intensity < 28) return 'drizzle';
  return 'rain';
}

function hasLightning(effect: ActiveEffect): boolean {
  const variant = getRainType(effect);
  return Boolean(effect.rain?.lightning) || variant === 'storm' || variant === 'fallout';
}

function getRainOptions(effect: ActiveEffect) {
  const rain = effect.rain ?? {};
  const intensity = clamp(effect.intensity, 0, 100);
  const density = clamp(rain.density ?? 24 + intensity * 1.8, 8, 260);
  const densityScale = clamp(density / 110, 0.18, 2.5);
  const speed = clamp(rain.speed ?? 1 + intensity / 45, 0.2, 6);
  const type = getRainType(effect);
  const base = weatherData[type] ?? weatherData.rain;
  const dropWidth = clamp(rain.dropWidth ?? 1.5 + intensity / 80, 1, 8);

  return {
    ...base,
    dropletsRate: clamp(25 + density * 0.7, 12, 240),
    maxDrops: Math.round(clamp(240 + density * 4.5, 160, 1600)),
    rainChance: clamp(base.rainChance * densityScale, 0.04, 0.9),
    rainLimit: clamp(Math.round(base.rainLimit * densityScale), 1, 18),
    minR: clamp(8 + dropWidth * 1.5, 6, 28),
    maxR: clamp(22 + dropWidth * 4, 14, 64),
    globalTimeScale: speed,
    trailRate: clamp(base.trailRate * speed, 0.2, 7),
    trailScaleRange: base.trailScaleRange,
    raining: true,
  };
}

export function ReactWeatherRainEffect({ effect }: { effect: ActiveEffect }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const options = useMemo(() => getRainOptions(effect), [effect]);
  const opacity = clamp(effect.rain?.opacity ?? 0.38 + effect.intensity / 180, 0.12, 1);
  const variant = getRainType(effect);
  const lightning = hasLightning(effect);
  const effectKey = JSON.stringify({
    intensity: effect.intensity,
    options,
    opacity,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || typeof window === 'undefined') return undefined;

    let disposed = false;
    let frameId: number | null = null;
    let raindrops: RaindropsInstance | null = null;
    const context = canvas.getContext('2d');

    const resizeCanvas = () => {
      if (!context) return;
      const rect = parent.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpi = window.devicePixelRatio || 1;
      canvas.width = width * dpi;
      canvas.height = height * dpi;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(1, 0, 0, 1, 0, 0);
    };

    const stopRaindrops = () => {
      if (raindrops && typeof raindrops.destroy === 'function') {
        raindrops.destroy();
      }
      raindrops = null;
    };

    const start = async () => {
      const [dropAlpha, dropColor] = await Promise.all([
        loadImage(DROP_ALPHA_URL),
        loadImage(DROP_COLOR_URL),
      ]);
      if (disposed || !context) return;

      resizeCanvas();
      const dpi = window.devicePixelRatio || 1;
      raindrops = new RaindropsClass(canvas.width, canvas.height, dpi, dropAlpha, dropColor, options);

      const draw = () => {
        if (disposed || !context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (raindrops?.canvas) {
          context.globalAlpha = opacity;
          context.drawImage(raindrops.canvas, 0, 0, canvas.width, canvas.height);
          context.globalAlpha = 1;
        }
        frameId = window.requestAnimationFrame(draw);
      };

      draw();
    };

    const handleResize = () => {
      stopRaindrops();
      void start();
    };

    void start();
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      if (frameId != null) window.cancelAnimationFrame(frameId);
      stopRaindrops();
    };
  }, [effectKey, opacity, options]);

  return (
    <div
      data-testid="react-weather-rain-effect"
      data-rain-variant={variant}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      {lightning ? (
        <>
          <style>
            {'@keyframes vne-weather-lightning{0%,88%,100%{opacity:0}89%{opacity:.72}90%{opacity:.06}91%{opacity:.5}93%{opacity:0}}'}
          </style>
          <div
            data-testid="react-weather-rain-lightning"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(210,232,255,0.95)',
              mixBlendMode: 'screen',
              opacity: 0,
              animation: variant === 'fallout'
                ? 'vne-weather-lightning 1.4s linear infinite'
                : 'vne-weather-lightning 4.8s linear infinite',
              pointerEvents: 'none',
            }}
          />
        </>
      ) : null}
    </div>
  );
}
