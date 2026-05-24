# Журнал змін — 17 травня 2026

## Огляд сесії
Інтернаціоналізація (typed translations + pluralization), Dependency Injection для аудіо-системи, консолідація шляхів доступу до даних.

## Зміни

### i18n — typed translations + Ukrainian pluralization
- **НОВИЙ** `lib/translations.ts`: 5 мов (en/uk/ru/pl/de), плоскі `Record<string, string>` мапи, експорт `allTranslations`, `Language`, `LanguageInfo`, `SUPPORTED_LANGUAGES`
- `lib/i18n-context.tsx`: видалено `import translations.json`, тепер імпортує `allTranslations` з `lib/translations.ts`. `pluralize()` тепер підтримує one/few/many для української/російської
- Видалено дубльовані типи `Language`, `LanguageInfo`, `SUPPORTED_LANGUAGES` (були в `i18n-context.tsx`)

### Block-registry — bilingual fields → i18n keys
- `lib/block-registry.ts`: видалено `labelUa`/`descriptionUa` з `BlockRegistryEntry` та `BLOCK_CATEGORIES`. Додано `getBlockLabelKey()`, `getBlockDescKey()`, `getCategoryLabelKey()`. Видалено мертву `getBlockLabel()`
- 5 компонентів оновлено: `BlockPickerModal`, `BlockPalette`, `BlockCard`, `BlockFlowCanvas`, `BlockConfigPanel` — `entry.labelUa` → `t(getBlockLabelKey(entry.type))`

### Dependency Injection — аудіо-система
- **НОВИЙ** `lib/audio-interfaces.ts`: `IAudioPlayerService`, `IAudioLibraryService`, `IAudioManager` — центральні абстракції
- `lib/audio-player-service.ts`: `implements IAudioPlayerService`
- `lib/audio-library-service.ts`: `implements IAudioLibraryService`
- `lib/audio-trigger-scheduler.ts`: конструктор приймає `IAudioPlayerService`/`IAudioLibraryService`
- `lib/audio-manager-enhanced.ts`: `implements IAudioManager`, конструктор приймає опціональні `IAudioPlayerService`+`IAudioLibraryService`. Додано `createEnhancedAudioManager()` factory
- `hooks/useReaderAudio.ts`: третій параметр `deps?: { audioManager?: IAudioManager }` — default до singleton
- `hooks/use-file-picker.ts`: опціональні `imagePicker`/`documentPicker` параметри з дефолтами

### Консолідація шляхів даних
- `lib/story-repository.ts`: **ВИДАЛЕНО** — 0 консьюмерів (dead code)
- `stores/scene-store.ts`: видалено `zustand persist` — прибирає дублюючий AsyncStorage key `scene-store` (дані вже зберігаються через `scene-persistence` в `scene-store-autosave`). Додано `hydrate()` action
- `lib/scene-persistence.ts`: додано `hydrate` з `AUTOSAVE_KEY` на mount — єдиний key `scene-store-autosave` для читання і запису
- `stores/use-app-store.ts`: додано `mediaLibrary` state + `setMediaLibrary` action
- `components/media-library.tsx`: `getLibraryAssets()`/`setLibraryAssets()` тепер через `useAppStore`, не напряму AsyncStorage
- `lib/audio-library.ts`: `getAudioLibrary()`/`saveAudioLibrary()` тепер через `useAppStore`
- `hooks/use-character-library.ts`: видалено мертвий `import AsyncStorage`

### Виправлення багів (open code аналіз)
- `components/story-reader.tsx`: `char.imageUri` → `char.uri` (неіснуюча властивість, персонажі не відображались). Додано null check для `scene.text`
- `components/story-reader-responsive.tsx`: `char.imageUri` → `char.uri`
- `lib/story-validator.ts`: валідатор конвертував персонажів у рядки (`String(c)` → `"[object Object]"`). Переписано на валідацію `CharacterSprite` об'єктів
- `lib/audio-library.ts`: `throw new Error(...)` → `throw ErrorHandler.handleValidationError(...)`

## Пов'язані сторінки
[[2026-05-17-session-report|Звіт сесії 2026-05-17]]
[[fixes-2026-05-17|Виправлення 2026-05-17]]
[[index|Головна сторінка wiki]]
