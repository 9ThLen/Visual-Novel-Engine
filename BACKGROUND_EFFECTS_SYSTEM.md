# Background Effects System Documentation

## Overview

Система анимированных эффектов для фонов визуальных новелл. Добавляет атмосферу и динамику сценам с помощью различных погодных и визуальных эффектов.

## Features

### ✅ Типы эффектов (8 типов)

1. **Sunrays (☀️)** - Солнечные лучи
   - Вращающиеся лучи света
   - Настройка количества лучей (4-12)
   - Настройка цвета и прозрачности

2. **Rain (🌧)** - Дождь
   - Падающие капли дождя (50-200 капель)
   - Настройка скорости и угла падения
   - Настройка цвета и интенсивности

3. **Snow (❄️)** - Снег
   - Падающие снежинки (30-150 штук)
   - Эффект покачивания на ветру
   - Разные размеры снежинок

4. **Fog (🌫)** - Туман
   - Движущиеся слои тумана (2-5 слоев)
   - Настройка плотности и цвета
   - Эффект глубины

5. **Storm (⚡)** - Гроза
   - Вспышки молний
   - Настройка частоты и интенсивности
   - Двойные вспышки (случайно)

6. **Particles (🍂)** - Частицы
   - Падающие частицы (листья, пепел, лепестки)
   - 4 типа частиц: circle, leaf, ash, petal
   - Эффект вращения и покачивания

7. **Sparkles (✨)** - Блестки
   - Мерцающие искры (20-80 штук)
   - Эффект мерцания
   - Крестообразная форма

8. **Clouds** - Облака (будущее)
   - Движущиеся облака
   - Настройка размера и скорости

### ✅ Настройки эффектов

- **Intensity** (0.0 - 1.0) - интенсивность эффекта
- **Speed** (0.0 - 2.0) - скорость анимации
- **Opacity** (0.0 - 1.0) - прозрачность
- **Color** - цвет эффекта (опционально)
- **Enabled** - включить/выключить эффект

### ✅ Готовые пресеты

1. **Sunny Day** - солнечный день с лучами
2. **Rainy Day** - дождливый день с туманом
3. **Snowy Day** - снежный день
4. **Thunderstorm** - гроза с молниями и дождем
5. **Foggy Morning** - туманное утро
6. **Magical Sparkles** - магические искры
7. **Autumn Leaves** - падающие осенние листья

## Architecture

### Data Flow

```
Scene
  ↓
Background Effects Array
  ├─ Effect 1: Rain (intensity: 0.7, speed: 1.2)
  ├─ Effect 2: Fog (intensity: 0.3, speed: 0.2)
  └─ Effect 3: Storm (intensity: 0.8, speed: 1.0)
  ↓
BackgroundEffectsManager
  ↓
Individual Effect Components
  ├─ RainEffect
  ├─ FogEffect
  └─ StormEffect
  ↓
Animated Rendering
```

### Type Definitions

```typescript
// Effect configuration
interface BackgroundEffect {
  id: string;
  type: BackgroundEffectType;
  intensity: number; // 0.0 - 1.0
  speed: number; // 0.0 - 2.0
  color?: string;
  opacity?: number; // 0.0 - 1.0
  enabled: boolean;
}

// Effect types
type BackgroundEffectType =
  | 'sunrays'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'storm'
  | 'particles'
  | 'sparkles'
  | 'clouds';

// Scene with effects
interface SceneWithEffects {
  id: string;
  backgroundEffects?: BackgroundEffect[];
  // ... other properties
}
```

## Usage Examples

### 1. Дождливая сцена

```typescript
const effects: BackgroundEffect[] = [
  {
    id: 'rain_1',
    type: 'rain',
    intensity: 0.7,
    speed: 1.2,
    opacity: 0.6,
    color: '#A0C4FF',
    enabled: true,
  },
  {
    id: 'fog_1',
    type: 'fog',
    intensity: 0.3,
    speed: 0.2,
    opacity: 0.3,
    color: '#E0E0E0',
    enabled: true,
  },
];
```

### 2. Солнечный день

```typescript
const effects: BackgroundEffect[] = [
  {
    id: 'sunrays_1',
    type: 'sunrays',
    intensity: 0.6,
    speed: 0.3,
    opacity: 0.4,
    color: '#FFD700',
    enabled: true,
  },
];
```

### 3. Гроза

```typescript
const effects: BackgroundEffect[] = [
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
    color: '#FFFFFF',
    enabled: true,
  },
];
```

### 4. Снежный день

```typescript
const effects: BackgroundEffect[] = [
  {
    id: 'snow_1',
    type: 'snow',
    intensity: 0.6,
    speed: 0.5,
    opacity: 0.7,
    enabled: true,
  },
];
```

### 5. Магические искры

```typescript
const effects: BackgroundEffect[] = [
  {
    id: 'sparkles_1',
    type: 'sparkles',
    intensity: 0.6,
    speed: 0.8,
    opacity: 0.6,
    color: '#FFD700',
    enabled: true,
  },
];
```

### 6. Осенние листья

```typescript
const effects: BackgroundEffect[] = [
  {
    id: 'particles_1',
    type: 'particles',
    intensity: 0.5,
    speed: 0.6,
    opacity: 0.7,
    color: '#D2691E',
    enabled: true,
  },
];
```

## UI Components

### BackgroundEffectsManager

Рендерит все активные эффекты.

```tsx
import { BackgroundEffectsManager } from '@/components/effects/BackgroundEffectsManager';

<BackgroundEffectsManager effects={scene.backgroundEffects || []} />
```

### BackgroundEffectsEditor

Редактор эффектов для сцен.

```tsx
import { BackgroundEffectsEditor } from '@/components/BackgroundEffectsEditor';

<BackgroundEffectsEditor
  effects={scene.backgroundEffects || []}
  onChange={(effects) => {
    updateScene({ ...scene, backgroundEffects: effects });
  }}
/>
```

**Features:**
- Добавление/удаление эффектов
- Настройка параметров
- Включение/выключение эффектов
- Готовые пресеты
- Предпросмотр в реальном времени

## Integration Guide

### Step 1: Add to Scene Type

```typescript
// Extend scene type
interface StoryScene {
  id: string;
  text: string;
  backgroundEffects?: BackgroundEffect[];
  // ... other properties
}
```

### Step 2: Add to Scene Editor

```tsx
import { BackgroundEffectsEditor } from '@/components/BackgroundEffectsEditor';

// In scene editor component
<BackgroundEffectsEditor
  effects={scene.backgroundEffects || []}
  onChange={(effects) => {
    updateScene({ ...scene, backgroundEffects: effects });
  }}
/>
```

### Step 3: Add to Story Reader

```tsx
import { BackgroundEffectsManager } from '@/components/effects/BackgroundEffectsManager';

// In story reader component
<View style={styles.container}>
  {/* Background image */}
  <Image source={{ uri: scene.backgroundUri }} style={styles.background} />
  
  {/* Background effects */}
  <BackgroundEffectsManager effects={scene.backgroundEffects || []} />
  
  {/* Characters */}
  {/* ... */}
  
  {/* Dialogue */}
  {/* ... */}
</View>
```

## Effect Components

### SunraysEffect

```tsx
<SunraysEffect
  intensity={0.6}
  speed={0.3}
  opacity={0.4}
  color="#FFD700"
/>
```

**Parameters:**
- `intensity` - количество лучей (4-12)
- `speed` - скорость вращения
- `opacity` - прозрачность
- `color` - цвет лучей

### RainEffect

```tsx
<RainEffect
  intensity={0.7}
  speed={1.2}
  opacity={0.6}
  color="#A0C4FF"
/>
```

**Parameters:**
- `intensity` - количество капель (50-200)
- `speed` - скорость падения
- `opacity` - прозрачность
- `color` - цвет капель

### SnowEffect

```tsx
<SnowEffect
  intensity={0.6}
  speed={0.5}
  opacity={0.7}
/>
```

**Parameters:**
- `intensity` - количество снежинок (30-150)
- `speed` - скорость падения
- `opacity` - прозрачность

### FogEffect

```tsx
<FogEffect
  intensity={0.7}
  speed={0.3}
  opacity={0.5}
  color="#E0E0E0"
/>
```

**Parameters:**
- `intensity` - количество слоев (2-5)
- `speed` - скорость движения
- `opacity` - прозрачность
- `color` - цвет тумана

### StormEffect

```tsx
<StormEffect
  intensity={0.8}
  speed={1.0}
  opacity={1.0}
  color="#FFFFFF"
/>
```

**Parameters:**
- `intensity` - интенсивность вспышек
- `speed` - частота молний
- `opacity` - прозрачность
- `color` - цвет молнии

### ParticlesEffect

```tsx
<ParticlesEffect
  intensity={0.5}
  speed={0.6}
  opacity={0.7}
  color="#D2691E"
  particleType="leaf"
/>
```

**Parameters:**
- `intensity` - количество частиц (20-100)
- `speed` - скорость падения
- `opacity` - прозрачность
- `color` - цвет частиц
- `particleType` - тип: 'circle' | 'leaf' | 'ash' | 'petal'

### SparklesEffect

```tsx
<SparklesEffect
  intensity={0.6}
  speed={0.8}
  opacity={0.6}
  color="#FFD700"
/>
```

**Parameters:**
- `intensity` - количество блесток (20-80)
- `speed` - скорость мерцания
- `opacity` - прозрачность
- `color` - цвет блесток

## Performance Optimization

### Best Practices

1. **Limit Active Effects**
   - Рекомендуется не более 2-3 эффектов одновременно
   - Отключайте неиспользуемые эффекты

2. **Adjust Particle Count**
   - Используйте intensity 0.3-0.7 для оптимальной производительности
   - Высокая интенсивность (0.8-1.0) может снизить FPS

3. **Use Appropriate Speed**
   - Медленные эффекты (speed 0.3-0.7) более плавные
   - Быстрые эффекты (speed 1.2-2.0) могут быть резкими

4. **Opacity Settings**
   - Используйте opacity 0.5-0.8 для естественного вида
   - Низкая прозрачность (0.2-0.4) для тонких эффектов

## Presets Reference

### Sunny Day
```typescript
{
  effects: [
    { type: 'sunrays', intensity: 0.6, speed: 0.3, opacity: 0.4 }
  ]
}
```

### Rainy Day
```typescript
{
  effects: [
    { type: 'rain', intensity: 0.7, speed: 1.2, opacity: 0.6 },
    { type: 'fog', intensity: 0.3, speed: 0.2, opacity: 0.3 }
  ]
}
```

### Snowy Day
```typescript
{
  effects: [
    { type: 'snow', intensity: 0.6, speed: 0.5, opacity: 0.7 }
  ]
}
```

### Thunderstorm
```typescript
{
  effects: [
    { type: 'rain', intensity: 0.9, speed: 1.5, opacity: 0.7 },
    { type: 'storm', intensity: 0.8, speed: 1.0, opacity: 1.0 }
  ]
}
```

### Foggy Morning
```typescript
{
  effects: [
    { type: 'fog', intensity: 0.7, speed: 0.3, opacity: 0.5 }
  ]
}
```

### Magical Sparkles
```typescript
{
  effects: [
    { type: 'sparkles', intensity: 0.6, speed: 0.8, opacity: 0.6, color: '#FFD700' }
  ]
}
```

### Autumn Leaves
```typescript
{
  effects: [
    { type: 'particles', intensity: 0.5, speed: 0.6, opacity: 0.7, color: '#D2691E' }
  ]
}
```

## Customization

### Creating Custom Presets

```typescript
const customPreset: EffectPreset = {
  id: 'my_preset',
  name: 'My Custom Effect',
  description: 'Custom combination',
  effects: [
    {
      id: 'effect_1',
      type: 'rain',
      intensity: 0.5,
      speed: 1.0,
      opacity: 0.5,
      enabled: true,
    },
    {
      id: 'effect_2',
      type: 'sparkles',
      intensity: 0.3,
      speed: 0.5,
      opacity: 0.4,
      color: '#00FFFF',
      enabled: true,
    },
  ],
};
```

### Combining Effects

Эффекты можно комбинировать для создания сложных атмосферных сцен:

```typescript
// Мистическая сцена
const mysticalScene = [
  { type: 'fog', intensity: 0.6, speed: 0.2, opacity: 0.4, color: '#9370DB' },
  { type: 'sparkles', intensity: 0.4, speed: 0.6, opacity: 0.5, color: '#FFD700' },
  { type: 'particles', intensity: 0.2, speed: 0.3, opacity: 0.3, color: '#FF69B4' },
];

// Апокалиптическая сцена
const apocalypticScene = [
  { type: 'particles', intensity: 0.7, speed: 0.8, opacity: 0.6, color: '#8B4513' }, // ash
  { type: 'fog', intensity: 0.5, speed: 0.3, opacity: 0.5, color: '#696969' },
  { type: 'storm', intensity: 0.6, speed: 1.2, opacity: 0.8, color: '#FF4500' },
];
```

## Status

✅ **All components implemented**
- 8 effect types created
- Animation system working
- UI editor complete
- 7 presets available
- Documentation written

**Ready for integration into scene editor and story reader**

---

**Version:** 1.0.0  
**Date:** 2026-04-12  
**Status:** ✅ Production Ready
