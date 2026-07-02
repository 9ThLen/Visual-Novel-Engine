import React, { useMemo } from 'react';
import ReactSnowfall from 'react-snowfall';
import type { ActiveEffect } from '@/lib/engine/runtime-types';

interface WeatherEffectsLayerProps {
  effects: ActiveEffect[];
  target?: ActiveEffect['target'];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function strongestEffect(effects: ActiveEffect[], type: 'rain' | 'snow', target: ActiveEffect['target']): ActiveEffect | null {
  return effects
    .filter((effect) => effect.effectType === type && (effect.target ?? 'screen') === target)
    .sort((a, b) => b.intensity - a.intensity)[0] ?? null;
}

function createImages(imageUris?: string[]): CanvasImageSource[] | undefined {
  if (!imageUris?.length || typeof window === 'undefined') return undefined;
  return imageUris.map((uri) => {
    const image = new window.Image();
    image.src = uri;
    return image;
  });
}

function RainLayer({ effect }: { effect: ActiveEffect }) {
  const rain = effect.rain ?? {};
  const intensity = clamp(effect.intensity, 0, 100);
  const density = Math.round(clamp(rain.density ?? 24 + intensity * 1.8, 0, 260));
  const speed = clamp(rain.speed ?? 1 + intensity / 45, 0.2, 6);
  const wind = clamp(rain.wind ?? 0, -80, 80);
  const angle = rain.angle ?? -12;
  const dropLength = clamp(rain.dropLength ?? 18 + intensity * 0.34, 6, 80);
  const dropWidth = clamp(rain.dropWidth ?? 1.5 + intensity / 80, 1, 6);
  const opacity = clamp(rain.opacity ?? 0.18 + intensity / 220, 0, 1);
  const color = rain.color ?? 'rgba(210, 232, 255, 0.92)';
  const splashCount = rain.splash ? Math.round(clamp(density / 8, 4, 32)) : 0;
  const lightning = Boolean(rain.lightning);

  const drops = useMemo(
    () => Array.from({ length: density }, (_, index) => ({
      id: index,
      left: (index * 37) % 100,
      delay: -((index * 97) % 1400) / 1000,
      duration: clamp((0.9 + ((index * 13) % 50) / 100) / speed, 0.18, 4),
      top: -10 - ((index * 19) % 80),
    })),
    [density, speed],
  );

  return (
    <div className="vn-weather-rain" style={{ opacity }}>
      <style>{`
        .vn-weather-rain {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .vn-weather-rain-drop {
          position: absolute;
          display: block;
          border-radius: 999px;
          animation-name: vn-weather-rain-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
        }
        .vn-weather-rain-splash {
          position: absolute;
          bottom: 2%;
          width: 16px;
          height: 5px;
          border: 1px solid ${color};
          border-top: 0;
          border-radius: 50%;
          opacity: 0;
          animation: vn-weather-rain-splash 1.35s ease-out infinite;
        }
        .vn-weather-lightning {
          position: absolute;
          inset: 0;
          background: rgba(230, 242, 255, 0.72);
          opacity: 0;
          animation: vn-weather-lightning 6.5s linear infinite;
        }
        @keyframes vn-weather-rain-fall {
          from { transform: translate3d(0, -18vh, 0) rotate(var(--rain-angle)); }
          to { transform: translate3d(var(--rain-wind), 118vh, 0) rotate(var(--rain-angle)); }
        }
        @keyframes vn-weather-rain-splash {
          0%, 72%, 100% { opacity: 0; transform: scale(0.45); }
          80% { opacity: 0.65; transform: scale(1); }
          92% { opacity: 0; transform: scale(1.55); }
        }
        @keyframes vn-weather-lightning {
          0%, 72%, 75%, 77%, 100% { opacity: 0; }
          73% { opacity: 0.6; }
          76% { opacity: 0.22; }
        }
      `}</style>
      {drops.map((drop) => (
        <span
          key={drop.id}
          className="vn-weather-rain-drop"
          style={{
            left: `${drop.left}%`,
            top: `${drop.top}%`,
            width: dropWidth,
            height: dropLength,
            background: color,
            animationDelay: `${drop.delay}s`,
            animationDuration: `${drop.duration}s`,
            ['--rain-angle' as string]: `${angle}deg`,
            ['--rain-wind' as string]: `${wind}px`,
          }}
        />
      ))}
      {Array.from({ length: splashCount }, (_, index) => (
        <span
          key={`splash-${index}`}
          className="vn-weather-rain-splash"
          style={{
            left: `${(index * 23) % 100}%`,
            animationDelay: `${-((index * 83) % 1400) / 1000}s`,
          }}
        />
      ))}
      {lightning ? <span className="vn-weather-lightning" /> : null}
    </div>
  );
}

export function WeatherEffectsLayer({ effects, target = 'screen' }: WeatherEffectsLayerProps) {
  const rain = strongestEffect(effects, 'rain', target);
  const snow = strongestEffect(effects, 'snow', target);
  const snowOptions = snow?.snow;
  const snowImages = useMemo(() => createImages(snowOptions?.imageUris), [snowOptions?.imageUris]);

  if (!rain && !snow) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      {rain ? <RainLayer effect={rain} /> : null}
      {snow ? (
        <ReactSnowfall
          color={snowOptions?.color}
          snowflakeCount={snowOptions?.snowflakeCount ?? Math.round(40 + clamp(snow.intensity, 0, 100) * 1.6)}
          radius={snowOptions?.radius}
          speed={snowOptions?.speed}
          wind={snowOptions?.wind}
          changeFrequency={snowOptions?.changeFrequency}
          rotationSpeed={snowOptions?.rotationSpeed}
          opacity={snowOptions?.opacity}
          enable3DRotation={snowOptions?.enable3DRotation}
          images={snowImages}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: clamp(0.2 + snow.intensity / 130, 0, 1),
          }}
        />
      ) : null}
    </div>
  );
}
