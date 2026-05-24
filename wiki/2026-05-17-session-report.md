# Робота 2026-05-17 — i18n, DI, Консолідація даних

## Огляд

Три блоки роботи: (1) переведення інтернаціоналізації на typed TS модулі з правильною pluralization, (2) Dependency Injection для аудіо-системи та file picker, (3) консолідація трьох різних шляхів AsyncStorage в один центральний.

---

## 1. i18n — typed translations + українська pluralization

### Проблема
- `translations.json` — не типізований JSON, ключі не перевіряються компілятором
- `pluralize()` підтримував тільки англійську one/other (count === 1 ? singular : plural). Українська потребує one/few/many
- `block-registry.ts` мав bilingual поля (`labelUa`/`descriptionUa`), які дублювали логіку i18n

### Рішення

**`lib/translations.ts`** — новий модуль з 5 мовами:
- `allTranslations: Record<Language, Record<string, string>>` — `en → { key → text }`
- `SUPPORTED_LANGUAGES`, `Language`, `LanguageInfo`, `getLanguageInfo()`
- Всі рядки з `translations.json` мігрувано в типізовані мапи

**`lib/i18n-context.tsx`**:
- Видалено `import translations from './translations.json'` та всі дубльовані типи
- `t()` тепер читає `allTranslations[language][key]`
- `pluralize(count, one, few?, many?)`:
  - `few === undefined` → English: `count === 1 ? one : many`
  - `few !== undefined` → Ukrainian/Russian: one/few/many за правилами слов'янських мов

**`lib/block-registry.ts`**:
- Видалено `labelUa`/`descriptionUa` з `BlockRegistryEntry`
- Додано `getBlockLabelKey(type)`, `getBlockDescKey(type)`, `getCategoryLabelKey(category)`
- Видалено `getBlockLabel()` — dead code (0 callers)

**5 компонентів оновлено:**
- `BlockPickerModal`, `BlockPalette`, `BlockCard`, `BlockFlowCanvas`, `BlockConfigPanel`
- `entry.labelUa` → `t(getBlockLabelKey(entry.type))`
- `entry.descriptionUa` → `t(getBlockDescKey(entry.type))`
- `cat.labelUa` → `t(getCategoryLabelKey(cat.key))`

---

## 2. Dependency Injection — аудіо-система та file picker

### Проблема

| Модуль | Проблема | Тестованість |
|--------|----------|-------------|
| `AudioPlayerService` | Синглтон без інтерфейсу | Складно замокати |
| `AudioLibraryService` | Синглтон без інтерфейсу | Складно замокати |
| `EnhancedAudioManager` | Фасад створює свої залежності всередині | Важко підставити мок |
| `useReaderAudio` | Імпортує `enhancedAudioManager` напряму | Тест залежить від модульної mock-системи |
| `useFilePicker` | Прямі виклики `ImagePicker`/`DocumentPicker` | Складно тестувати |

### Рішення

**`lib/audio-interfaces.ts`** — центральний файл абстракцій:
- `IAudioPlayerService` — всі публічні методи `AudioPlayerService`
- `IAudioLibraryService` — всі публічні методи `AudioLibraryService`
- `IAudioManager` — всі публічні методи `EnhancedAudioManager`

**Інтерфейси імплементовано:**
- `audio-player-service.ts`: `class AudioPlayerService implements IAudioPlayerService`
- `audio-library-service.ts`: `class AudioLibraryService implements IAudioLibraryService`
- `audio-trigger-scheduler.ts`: конструктор приймає `IAudioPlayerService`/`IAudioLibraryService`
- `audio-manager-enhanced.ts`:
  - `class EnhancedAudioManager implements IAudioManager`
  - `constructor(playerService?: IAudioPlayerService, libraryService?: IAudioLibraryService)`
  - `createEnhancedAudioManager()` factory function
  - `enhancedAudioManager` / `audioManager` — дефолтні singleton-и (зворотня сумісність)

**Ін'єкція в консьюмери:**
- `useReaderAudio(currentScene, settings, deps?)`:
  - `deps.audioManager?: IAudioManager` — default до singleton
  - Існуючі виклики без змін (третій параметр опціональний)
- `useFilePicker({ ..., imagePicker?, documentPicker? })`:
  - `imagePicker = ExpoImagePicker` (default)
  - `documentPicker = ExpoDocumentPicker` (default)
  - Тести можуть підставити мок-об'єкти

**Тест (залишився робочим):**
- `__tests__/unit/use-reader-audio.test.ts` — `vi.mock('../../lib/audio-manager-enhanced')` все ще працює, тести не змінювались

---

## 3. Консолідація шляхів даних

### Проблема

Три різні шляхи доступу до AsyncStorage, що ускладнює дебагінг та тестування:
1. `AsyncStorage → StoryRepository → (0 консьюмерів)` — dead code
2. `AsyncStorage → scene-store persist (key: "scene-store")` + `AsyncStorage → scene-persistence (key: "scene-store-autosave")` — дублювання!
3. `AsyncStorage → media-library.tsx` + `AsyncStorage → audio-library.ts` — прямі виклики

### Рішення

**`lib/story-repository.ts`** — **ВИДАЛЕНО**:
- 0 імпортів в коді, 0 тестів
- Його функціональність вже покрита `useAppStore`

**`stores/scene-store.ts`** — видалено `zustand persist`:
- Раніше: `persist(store, { name: 'scene-store', storage: createJSONStorage(() => AsyncStorage) })`
- Тепер: без persist, додано `hydrate(data)` action
- Дані більше не дублюються в двох AsyncStorage ключах

**`lib/scene-persistence.ts`** — додано `hydrate` на mount:
- Читає з `AUTOSAVE_KEY` при монтуванні, заповнює `scene-store`
- Зберігає в той же key при автосейві
- Єдиний key `scene-store-autosave` для читання і запису

**`stores/use-app-store.ts`** — центральне сховище:
- Додано `mediaLibrary: MediaLibraryAsset[]` до `AppState`
- Додано `setMediaLibrary(assets)` до `AppActions`
- Додано `mediaLibrary` до `partialize` (persist)

**`components/media-library.tsx`**:
- Видалено `import AsyncStorage`
- `getLibraryAssets()` → `useAppStore.getState().mediaLibrary`
- Додано `setLibraryAssets()` → `useAppStore.getState().setMediaLibrary(assets)`
- Всі внутрішні виклики `saveLibraryAssets()` переведено на `setLibraryAssets()`

**`lib/audio-library.ts`**:
- Видалено `import AsyncStorage`
- `getAudioLibrary(storyId)` → `useAppStore.getState().audioLibraries[storyId]`
- `saveAudioLibrary(storyId, library)` → `useAppStore.getState().setAudioLibrary(storyId, library)`

**`hooks/use-character-library.ts`**:
- Видалено мертвий `import AsyncStorage` (логіка вже через `lib/character-library` → `useAppStore`)

## Діаграма: було → стало

```
БУЛО:                            СТАЛО:
AsyncStorage                      useAppStore (Zustand persist)
  ├─ StoryRepository (dead)         ├─ storiesMetadata
  ├─ scene-store (persist)          ├─ scenesByStory
  ├─ scene-store-autosave           ├─ audioLibraries  ← audio-library.ts
  ├─ mediaLibrary                   ├─ mediaLibrary    ← media-library.tsx
  ├─ audio_libraries_{id}           ├─ characterLibraries
  ├─ character_library_{id}         └─ ...
  └─ ...                          scene-persistence
                                      └─ scene-store-autosave ← scene-store
```

## Стан проекту після змін

- `tsc --noEmit` — лише передіснуючі помилки (oauth, useLegoTabs, auth, tsconfig)
- Жодних нових TypeScript помилок не додано
- Усі зміни зворотньо сумісні: старі виклики `useReaderAudio(scene, settings)` продовжують працювати

## Пов'язані сторінки
[[index|Головна сторінка wiki]]
[[CHANGELOG_2026_05_17|Журнал змін 2026-05-17]]
