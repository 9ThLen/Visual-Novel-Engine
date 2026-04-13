# Audio Library & Trigger System

## Overview

Расширенная система управления аудио с поддержкой библиотек звуков для каждого проекта и триггеров воспроизведения.

## Основные возможности

### ✅ Библиотека звуков
- Отдельная библиотека для каждой истории
- Типы аудио: Music, SFX, Voice, Ambient
- Теги для организации
- Настройки громкости и зацикливания
- Поиск по имени и тегам

### ✅ Система триггеров
- **Scene Start** - воспроизведение при начале сцены
- **Text Complete** - после завершения печати текста
- **Delay** - через заданное время (мс)
- **Choices Shown** - когда появляются выборы
- **Manual** - ручной триггер

### ✅ Расширенные настройки
- Fade In/Out эффекты
- Остановка предыдущего аудио
- Настройка громкости
- Зацикливание
- Задержка воспроизведения

## Архитектура

### Типы данных

```typescript
// Элемент библиотеки
interface AudioLibraryItem {
  id: string;
  name: string;
  uri: string;
  type: 'music' | 'sfx' | 'voice' | 'ambient';
  duration?: number;
  loop?: boolean;
  volume?: number;
  tags?: string[];
  createdAt: number;
}

// Триггер воспроизведения
interface AudioTrigger {
  id: string;
  audioId: string; // Ссылка на AudioLibraryItem
  triggerType: AudioTriggerType;
  delay?: number; // Для типа 'delay'
  volume?: number; // Переопределение громкости
  loop?: boolean; // Переопределение зацикливания
  fadeIn?: number; // Fade in в мс
  fadeOut?: number; // Fade out в мс
  stopPrevious?: boolean; // Остановить предыдущее аудио
}

// Расширенная сцена
interface StorySceneExtended {
  id: string;
  text: string;
  audioTriggers: AudioTrigger[]; // Массив триггеров
  // ... остальные поля
}
```

### Компоненты

```
lib/
├── audio-types.ts              # TypeScript типы
├── audio-library.ts            # Управление библиотекой
└── audio-manager-enhanced.ts   # Менеджер воспроизведения

components/
├── AudioLibraryManager.tsx     # UI библиотеки
└── AudioTriggerEditor.tsx      # UI редактора триггеров
```

## Использование

### 1. Управление библиотекой

```typescript
import * as audioLibrary from '@/lib/audio-library';

// Добавить аудио в библиотеку
const newItem = await audioLibrary.addAudioToLibrary(storyId, {
  name: 'Thunder',
  uri: 'file:///path/to/thunder.mp3',
  type: 'sfx',
  loop: false,
  volume: 0.8,
  tags: ['weather', 'storm'],
});

// Получить библиотеку
const library = await audioLibrary.getAudioLibrary(storyId);

// Поиск по тегам
const results = await audioLibrary.searchAudioLibrary(storyId, 'storm');

// Фильтр по типу
const music = await audioLibrary.getAudioByType(storyId, 'music');
```

### 2. Создание триггеров

```typescript
import { enhancedAudioManager } from '@/lib/audio-manager-enhanced';

// Загрузить библиотеку
enhancedAudioManager.loadLibrary(audioLibraryItems);

// Выполнить триггер
await enhancedAudioManager.executeTrigger({
  id: 'trigger_1',
  audioId: 'audio_thunder',
  triggerType: 'delay',
  delay: 2000, // 2 секунды
  volume: 0.8,
  fadeIn: 500,
  stopPrevious: true,
});

// Выполнить все триггеры типа "scene_start"
await enhancedAudioManager.executeTriggersByType(
  scene.audioTriggers,
  'scene_start'
);
```

### 3. UI компоненты

#### AudioLibraryManager

```tsx
import { AudioLibraryManager } from '@/components/AudioLibraryManager';

<AudioLibraryManager
  storyId={story.id}
  visible={showLibrary}
  onClose={() => setShowLibrary(false)}
  onSelect={(item) => {
    console.log('Selected:', item);
  }}
  filterType="music" // Опционально
/>
```

#### AudioTriggerEditor

```tsx
import { AudioTriggerEditor } from '@/components/AudioTriggerEditor';

<AudioTriggerEditor
  storyId={story.id}
  triggers={scene.audioTriggers}
  onChange={(newTriggers) => {
    // Сохранить триггеры
    updateScene({ ...scene, audioTriggers: newTriggers });
  }}
/>
```

## Примеры использования

### Пример 1: Фоновая музыка при входе в сцену

```typescript
const trigger: AudioTrigger = {
  id: 'bgm_1',
  audioId: 'audio_forest_theme',
  triggerType: 'scene_start',
  volume: 0.6,
  loop: true,
  fadeIn: 1000, // 1 секунда fade in
  stopPrevious: true, // Остановить предыдущую музыку
};
```

### Пример 2: Звук грозы через 3 секунды

```typescript
const trigger: AudioTrigger = {
  id: 'thunder_1',
  audioId: 'audio_thunder',
  triggerType: 'delay',
  delay: 3000, // 3 секунды
  volume: 0.9,
  loop: false,
};
```

### Пример 3: Звук при завершении текста

```typescript
const trigger: AudioTrigger = {
  id: 'notification_1',
  audioId: 'audio_notification',
  triggerType: 'text_complete',
  volume: 0.5,
  loop: false,
};
```

### Пример 4: Ambient звуки при показе выборов

```typescript
const trigger: AudioTrigger = {
  id: 'ambient_1',
  audioId: 'audio_wind',
  triggerType: 'choice_shown',
  volume: 0.4,
  loop: true,
  fadeIn: 800,
};
```

## Интеграция с Story Reader

### Обновленный StoryReaderResponsive

```typescript
import { enhancedAudioManager } from '@/lib/audio-manager-enhanced';
import { getAudioLibrary } from '@/lib/audio-library';

// В useEffect при загрузке истории
useEffect(() => {
  async function loadAudio() {
    const library = await getAudioLibrary(story.id);
    enhancedAudioManager.loadLibrary(library);
  }
  loadAudio();
}, [story.id]);

// При смене сцены
useEffect(() => {
  if (!currentScene) return;

  // Выполнить триггеры scene_start
  enhancedAudioManager.executeTriggersByType(
    currentScene.audioTriggers || [],
    'scene_start'
  );
}, [currentScene?.id]);

// После завершения печати текста
useEffect(() => {
  if (isTyping) return;

  // Выполнить триггеры text_complete
  enhancedAudioManager.executeTriggersByType(
    currentScene.audioTriggers || [],
    'text_complete'
  );
}, [isTyping]);

// При показе выборов
useEffect(() => {
  if (!isLastPage || isTyping || scene.choices.length === 0) return;

  // Выполнить триггеры choice_shown
  enhancedAudioManager.executeTriggersByType(
    currentScene.audioTriggers || [],
    'choice_shown'
  );
}, [isLastPage, isTyping, scene.choices.length]);
```

## Миграция со старой системы

### Автоматическая миграция

```typescript
// Конвертировать старые URI в триггеры
function migrateSceneAudio(scene: StoryScene): StorySceneExtended {
  const triggers: AudioTrigger[] = [];

  // Музыка -> scene_start trigger
  if (scene.musicUri) {
    triggers.push({
      id: `migrated_music_${Date.now()}`,
      audioId: scene.musicUri, // Временно используем URI
      triggerType: 'scene_start',
      volume: 0.7,
      loop: true,
      stopPrevious: true,
    });
  }

  // Голос -> scene_start trigger
  if (scene.voiceAudioUri) {
    triggers.push({
      id: `migrated_voice_${Date.now()}`,
      audioId: scene.voiceAudioUri,
      triggerType: 'scene_start',
      volume: 0.8,
      loop: false,
    });
  }

  return {
    ...scene,
    audioTriggers: triggers,
  };
}
```

## API Reference

### AudioLibrary Functions

```typescript
// Получить библиотеку
getAudioLibrary(storyId: string): Promise<AudioLibraryItem[]>

// Сохранить библиотеку
saveAudioLibrary(storyId: string, library: AudioLibraryItem[]): Promise<void>

// Добавить аудио
addAudioToLibrary(storyId: string, item: Omit<AudioLibraryItem, 'id' | 'createdAt'>): Promise<AudioLibraryItem>

// Обновить аудио
updateAudioInLibrary(storyId: string, audioId: string, updates: Partial<AudioLibraryItem>): Promise<void>

// Удалить аудио
deleteAudioFromLibrary(storyId: string, audioId: string): Promise<void>

// Поиск
searchAudioLibrary(storyId: string, query: string): Promise<AudioLibraryItem[]>

// Фильтр по типу
getAudioByType(storyId: string, type: AudioLibraryItem['type']): Promise<AudioLibraryItem[]>

// Импорт из другой истории
importAudioLibrary(targetStoryId: string, sourceStoryId: string): Promise<void>

// Экспорт в JSON
exportAudioLibrary(storyId: string): Promise<string>
```

### EnhancedAudioManager Methods

```typescript
// Инициализация
initialize(): Promise<void>

// Загрузить библиотеку
loadLibrary(items: AudioLibraryItem[]): void

// Получить элемент библиотеки
getLibraryItem(audioId: string): AudioLibraryItem | undefined

// Выполнить триггер
executeTrigger(trigger: AudioTrigger, context?: { sceneId?: string }): Promise<void>

// Выполнить триггеры по типу
executeTriggersByType(triggers: AudioTrigger[], triggerType: AudioTriggerType, context?: { sceneId?: string }): Promise<void>

// Отменить триггер
cancelTrigger(triggerId: string): void

// Отменить все триггеры
cancelAllTriggers(): void

// Управление воспроизведением
pause(trackId: string): Promise<void>
resume(trackId: string): Promise<void>
stop(trackId: string, fadeOut?: number): Promise<void>
stopAll(fadeOut?: number): Promise<void>
stopByType(type: AudioLibraryItem['type'], fadeOut?: number): Promise<void>
setVolume(trackId: string, volume: number): Promise<void>
crossFade(trackId: string, newUri: string, volume: number, duration: number): Promise<void>

// Проверка состояния
isPlaying(trackId: string): boolean
getActiveTracksByType(type: AudioLibraryItem['type']): string[]
getPlaybackState(): AudioPlaybackState[]

// Очистка
cleanup(): Promise<void>
```

## Преимущества новой системы

### ✅ Организация
- Централизованная библиотека звуков
- Теги для категоризации
- Поиск и фильтрация
- Переиспользование аудио

### ✅ Гибкость
- Множественные триггеры на сцену
- Точный контроль времени воспроизведения
- Fade эффекты
- Условная остановка

### ✅ Производительность
- Предзагрузка библиотеки
- Эффективное управление памятью
- Отмена pending триггеров

### ✅ UX
- Визуальный редактор триггеров
- Предпросмотр аудио (будущее)
- Drag & drop (будущее)
- Импорт/экспорт библиотек

## Roadmap

### Phase 2
- [ ] Предпросмотр аудио в библиотеке
- [ ] Drag & drop для загрузки
- [ ] Визуальная timeline триггеров
- [ ] Копирование триггеров между сценами

### Phase 3
- [ ] Условные триггеры (на основе переменных)
- [ ] Crossfade между треками
- [ ] Audio ducking (понижение громкости фона)
- [ ] Spatial audio (3D позиционирование)

### Phase 4
- [ ] Waveform визуализация
- [ ] Trim/edit аудио в приложении
- [ ] Синтез речи (TTS)
- [ ] Запись голоса в приложении

## Заключение

Новая система аудио-библиотек и триггеров предоставляет профессиональный инструмент для создания богатого звукового оформления визуальных новелл. Каждый проект имеет собственную библиотеку, а гибкая система триггеров позволяет точно контролировать воспроизведение звуков в зависимости от событий в игре.

---

**Статус:** ✅ Готово к использованию  
**Версия:** 1.0.0  
**Дата:** 2026-04-12
