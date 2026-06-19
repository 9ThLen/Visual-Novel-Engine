# Схема проекту VNE

> Візуальна карта архітектури: які файли за що відповідають і як вони зв'язані.
> Оновлено: 2026-06-14

---

## Загальна архітектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Expo Router (app/)                          │
│  Файловий роутинг: кожен .tsx = сторінка/маршрут                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      Components (components/)                       │
│  UI-компоненти: reader, editor, document-editor, ui, shared        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                         Hooks (hooks/)                              │
│  Кастомні хуки: reader lifecycle, audio, assets, responsive        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      Domain Logic (lib/)                            │
│  Бізнес-логіка: engine, audio, story, editor, theme, i18n         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                       State (stores/)                               │
│  Zustand stores: app state, editor state, theme                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Вхідні точки (app/)

### Кореневий layout
| Файл | Роль |
|---|---|
| `app/_layout.tsx` | Root layout: ThemeProvider, ErrorBoundary, StoryAutoSave, ReaderAudioRouteGuard, ToastViewport. Ініціалізує глобальний CSS, приховує splash screen. |
| `app/+html.tsx` | HTML-шаблон для web-збірки (Expo Head). Містить `<meta>` теги, CSP (TODO). |
| `app/index.tsx` | Головний екран: список сторі, створення/видалення сторі, навігація до редактора/рідера. |

### Редактори
| Файл | Роль |
|---|---|
| `app/editor.tsx` | Класичний редактор сцен (timeline-based). Використовує `useEditorStore`. |
| `app/scene-editor.tsx` | Редактор однієї сени: блоки, властивості, міні-превью. |
| `app/scene-manager.tsx` | Менеджер сцен: створення, видалення, зв'язки між сценами. |
| `app/document-editor.tsx` | Режим документ-редактора (Plate.js інтеграція). |
| `app/vn-plate-editor.tsx` | VN Plate Editor: WebView-обгортка для plate-редактора. |
| `app/preview.tsx` | Превью сцени в реальному часі (MiniPreview). |

### Рідер
| Файл | Роль |
|---|---|
| `app/reader.tsx` | Основний екран читання. Використовує `useSceneExecutor` для прогону timeline. |
| `app/play.tsx` | Альтернативний режим програвання (PlayMode). |

### Інше
| Файл | Роль |
|---|---|
| `app/settings.tsx` | Налаштування: мова, тема, швидкість тексту, звук. |
| `app/save-load.tsx` | Збереження/завантаження: слоти, експорт, імпорт. |
| `app/oauth/callback.tsx` | OAuth callback для web-авторизації. |
| `app/tabs/_layout.tsx` | Layout для вкладок (якщо використовується tab navigation). |
| `app/tabs/index.tsx` | Головна вкладка. |

---

## 2. Компоненти (components/)

### Reader — компоненти читання
| Файл | Роль |
|---|---|
| `components/reader/ReaderDisplay.tsx` | Відображення діалогу, тексту, typewriter-ефект. |
| `components/reader/ReaderControls.tsx` | Кнопки керування: play/pause, skip, history, settings. |
| `components/reader/ReaderChoices.tsx` | Відображення варіантів вибору (choice blocks). |
| `components/reader/ReaderTransitions.tsx` | Анімовані переходи між сценами. |
| `components/story-reader-responsive.tsx` | Адаптивний layout рідера (phone/desktop). |
| `components/CharacterDisplay.tsx` | Відображення персонажів: спрайти, позиції, анімації. |
| `components/InteractiveObjectsLayer.tsx` | Інтерактивні об'єкти на сцені (клікабельні елементи). |
| `components/InteractiveObjectsEditor.tsx` | Редактор інтерактивних об'єктів. |
| `components/dialogue-history.tsx` | Історія діалогів (scrollable history panel). |
| `components/ReaderMenu.tsx` | Контекстне меню рідера. |
| `components/ReaderAudioRouteGuard.tsx` | Зупинка/відновлення audio при зміні маршруту. |

### Editor — компоненти редактора
| Файл | Роль |
|---|---|
| `components/editor/MiniPreview.tsx` | Міні-превью сцени в редакторі. |
| `components/editor/PlayMode.tsx` | Режим програвання в редакторі. |
| `components/editor/PreviewScreen.tsx` | Екран превью. |
| `components/editor/modals/` | Модальні вікна редактора. |
| `components/editor/properties/` | Панелі властивостей блоків. |

### Document Editor — документ-редактор (Plate.js)
| Файл | Роль |
|---|---|
| `components/document-editor/DocumentSceneEditor.tsx` | Основний редактор сцени (Plate editor). |
| `components/document-editor/DocumentSceneSidebar.tsx` | Бічна панель: список блоків, навігація. |
| `components/document-editor/DocumentBlockChoice.tsx` | Блок вибору (choice block UI). |
| `components/document-editor/DocumentBlockDialogue.tsx` | Блок діалогу (dialogue block UI). |
| `components/document-editor/DocumentChip.tsx` | Технічний чіп (chip/tag для блоку). |
| `components/document-editor/DocumentCommandMenu.tsx` | Меню команд (slash menu). |
| `components/document-editor/DocumentEditorHeader.tsx` | Заголовок редактора. |
| `components/document-editor/DocumentTechnicalPropertiesPanel.tsx` | Панель технічних властивостей блоку. |
| `components/document-editor/IssueGroups.tsx` | Групи валідаційних помилок. |
| `components/document-editor/DocumentPage.tsx` | Сторінка документа (shared). |
| `components/document-editor/DocumentPage.web.tsx` | Сторінка документа (web-specific). |
| `components/document-editor/DocumentPage.native.tsx` | Сторінка документа (native-specific). |
| `components/document-editor/useBlockOperations.ts` | Хук: операції з блоками (add, remove, move). |
| `components/document-editor/useDocumentKeyboard.ts` | Хук: клавіатурні швидкі клавіші. |
| `components/document-editor/useDocumentScroll.ts` | Хук: smart scroll при редагуванні. |
| `components/document-editor/document-*.ts` | Утиліти: command-ui, issue-ui, scene-outline, scene-templates. |

### VN Plate Editor
| Файл | Роль |
|---|---|
| `components/vn-plate-editor/PlateWebViewEditor.tsx` | WebView-обгортка для plate-редактора. |

### UI — базові компоненти
| Файл | Роль |
|---|---|
| `components/ui/Button.tsx` | Кнопка (theme-aware). |
| `components/ui/ConfirmDialog.tsx` | Діалог підтвердження. |
| `components/ui/Toast.tsx` | Toast-повідомлення. |
| `components/ui/collapsible.tsx` | Розкриваний контейнер. |
| `components/ui/icon-symbol.tsx` | Іконки (SF Symbols / Material Icons). |
| `components/ui/index.ts` | Barrel export. |

### Shared — спільні компоненти
| Файл | Роль |
|---|---|
| `components/ErrorBoundary.tsx` | Error boundary для відловлення помилок рендерингу. |
| `components/StoryAutoSave.tsx` | Автозбереження сторі при змінах. |
| `components/MigrationErrorBanner.tsx` | Банер помилок міграції. |
| `components/SplashScreen.tsx` | Екран завантаження. |
| `components/SplashScreenEditor.tsx` | Редактор екрану завантаження. |
| `components/StoryCard.tsx` | Картка сторі в списку. |
| `components/LanguageSelector.tsx` | Вибір мови. |
| `components/ShortcutHint.tsx` | Підказки клавіатурних скорочень. |
| `components/WebSidebar.tsx` | Бічна панель (web). |
| `components/WebTopBar.tsx` | Верхня панель (web). |
| `components/screen-container.tsx` | Контейнер екрану (responsive). |
| `components/themed-view.tsx` | View з підтримкою теми. |

---

## 3. Хуки (hooks/)

### Reader hooks
| Файл | Роль |
|---|---|
| `hooks/useReaderInitialization.ts` | Ініціалізація рідера: завантаження сторі, стану, змінних. |
| `hooks/useReaderPages.ts` | Обчислення "сторінок" для відображення (pagination). |
| `hooks/useReaderAssets.ts` | Завантаження асетів (фони, персонажі, спрайти). |
| `hooks/useReaderAudio.ts` | Керування аудіо в рідері. |
| `hooks/useReaderAutoAdvance.ts` | Автоматичне просування по тексту. |
| `hooks/useReaderNotifications.ts` | Сповіщення в рідері. |
| `hooks/useTypewriter.ts` | Typewriter-ефект для тексту. |
| `hooks/useDialogueHistory.ts` | Історія діалогів. |
| `hooks/useCharacterAnimations.ts` | Анімації персонажів. |
| `hooks/useSceneImages.ts` | Завантаження зображень сцен. |

### Shared hooks
| Файл | Роль |
|---|---|
| `hooks/use-colors.ts` | Доступ до кольорів теми (useColors). |
| `hooks/use-i18n.ts` | Локалізація (useTranslation). |
| `hooks/use-keyboard-shortcuts.ts` | Клавіатурні скорочення. |
| `hooks/use-story-state.ts` | Стан сторі (selector hook). |
| `hooks/useResponsiveLayout.ts` | Адаптивний layout (phone/desktop). |
| `hooks/useAutoSave.ts` | Автозбереження. |
| `hooks/useAssetUri.ts` | Разв'язання URI асетів. |

---

## 4. Бізнес-логіка (lib/)

### Engine — рушій сцен
| Файл | Роль |
|---|---|
| `lib/engine/useSceneExecutor.ts` | **Головний рушій**: виконує timeline сцени крок за кроком. Обробляє всі типи блоків. |
| `lib/engine/types.ts` | Типи: TimelineStep, SceneState, PlaybackState, SceneRecord, SceneConnection. |
| `lib/engine/index.ts` | Barrel export. |
| `lib/engine/conditionUtils.ts` | Утиліти умов: conditionsMet, createEmptySceneState. |
| `lib/engine/text-speed.ts` | Обчислення швидкості тексту. |
| `lib/engine/camera-effects.ts` | Ефекти камери (zoom, pan, focus). |
| `lib/engine/event-factory.ts` | Фабрика подій для аудіо/відео тригерів. |

### Audio — аудіо система
| Файл | Роль |
|---|---|
| `lib/audio-manager-enhanced.ts` | Розширений менеджер аудіо: керує всіма аудіо-треками. |
| `lib/audio-player-service.ts` | Низько-рівневий програвач: play, stop, pause, fade, crossfade. Singleton. |
| `lib/audio-library-service.ts` | Бібліотека аудіо: CRUD для аудіо-файлів. |
| `lib/audio-library.ts` | Легасі бібліотека аудіо (backward compat). |
| `lib/audio-trigger-scheduler.ts` | Планувальник аудіо-тригерів. |
| `lib/audio-web-source.ts` | Джерело аудіо для web (HTML5 Audio). |
| `lib/audio-interfaces.ts` | Інтерфейси: IAudioPlayerService, IAudioManager. |
| `lib/audio-types.ts` | Типи: AudioTrack, AudioLibraryItem. |
| `lib/reader-audio-session.ts` | Аудіо-сесія рідера: керування життєвим циклом. |

### Story Domain — домен сторі
| Файл | Роль |
|---|---|
| `lib/story-domain.ts` | StoryDomain: метадані сторі, валідація, операції. |
| `lib/story-validator.ts` | Валідація сторі (структура, зв'язки, блоки). |
| `lib/scene-operations.ts` | Операції з сценами: CRUD, canonical records, scene graph. |
| `lib/story-reader-choice.ts` | Логіка вибору в рідері (choice resolution). |
| `lib/story-reader-platform.ts` | Платформно-спечічна логіка рідера. |
| `lib/reader-runtime.ts` | Runtime рідера: buildCanonicalLoadSnapshot, buildCanonicalSaveSlot. |
| `lib/reader-launch.ts` | Запуск рідера: підготовка стану. |
| `lib/reader-utils.ts` | Утиліти рідера. |
| `lib/bundled-story-sync.ts` | Синхронізація вбудованих сторі (demo stories). |
| `lib/document-scene-persistence.ts` | Збереження/завантаження document scenes. |

### Editor — логіка редактора
| Файл | Роль |
|---|---|
| `lib/editor-scene-draft.ts` | Чернетка седи: тимчасовий стан при редагуванні. |
| `lib/editor-scene-save.ts` | Збереження седи: валідація + персистенція. |
| `lib/editor/block-validation.ts` | Валідація блоків (структура, обов'язкові поля). |
| `lib/editor/timeline-item-layout.ts` | Layout елементів таймлайну. |
| `lib/editor/timeline-sortable.ts` | Sortable для таймлайну (drag & drop). |
| `lib/editor/mini-preview-computation.ts` | Обчислення міні-превью. |

### Document Editor — документ-редактор
| Файл | Роль |
|---|---|
| `lib/document-editor/types.ts` | Типи: DocumentScene, DocumentBlock, PlateDocument. |
| `lib/document-editor/document-scene.ts` | DocumentScene: модель сцени для Plate. |
| `lib/document-editor/plate-document.ts` | PlateDocument: конвертація між Plate і внутрішнім форматом. |
| `lib/document-editor/commands.ts` | Команди редактора (insert, update, delete blocks). |
| `lib/document-editor/choice-target.ts` | Разв'язання target для choice blocks. |
| `lib/document-editor/route-actions.ts` | Дії маршрутизації (navigate, create scene). |
| `lib/document-editor/validation.ts` | Валідація документа. |

### VN Plate Editor
| Файл | Роль |
|---|---|
| `lib/vn-plate-editor/bridge.ts` | Bridge між WebView та React Native (postMessage). |
| `lib/vn-plate-editor/document-scene-adapter.ts` | Адаптер: конвертація scene ↔ plate document. |
| `lib/vn-plate-editor/storage.ts` | Збереження plate document. |
| `lib/vn-plate-editor/types.ts` | Типи: VNPlateDocument, VNPlateBlock. |
| `lib/vn-plate-editor/embedded-html.generated.ts` | Згенерований HTML для WebView (1.8MB bundle). |

### Characters — персонажі
| Файл | Роль |
|---|---|
| `lib/character-library.ts` | Бібліотека персонажів: CRUD, спрайти. |
| `lib/character-animator.ts` | Аніматор персонажів: переходи, ефекти. |
| `lib/character-colors.ts` | Кольори персонажів (name plate, dialogue box). |
| `lib/character-types.ts` | Типи: Character, CharacterSprite. |

### Theme — тема та дизайн-система
| Файл | Роль |
|---|---|
| `lib/theme-provider.tsx` | ThemeProvider: контекст теми, useThemeStore. |
| `lib/theme-variables.ts` | CSS-змінні теми (OKLCH). |
| `lib/theme-nativewind.ts` | NativeWind конфігурація (class→style mapping). |
| `lib/design-tokens.ts` | Дизайн-токени: 61 токен (Primitive → Semantic → Component). |
| `lib/responsive.ts` | Responsive utilities (breakpoints, phone/desktop). |

### i18n — локалізація
| Файл | Роль |
|---|---|
| `lib/translations.ts` | Переклади UK/EN (1155 рядків). |
| `lib/translations.json` | JSON-версія перекладів. |

### Core — ядро
| Файл | Роль |
|---|---|
| `lib/_core/api.ts` | API клієнт: rate limiting, auth headers, fetch wrapper. |
| `lib/_core/auth.ts` | Авторизація: OAuth flow, sessionStorage, user info. |
| `lib/_core/theme.ts` | Базові функції теми (withAlpha, color manipulation). |
| `lib/_core/nativewind-pressable.ts` | NativeWind Pressable polyfill. |

### Utilities
| Файл | Роль |
|---|---|
| `lib/asset-resolver.ts` | Разв'язання асетів: URI → локальний шлях, валідація. |
| `lib/error-handler.ts` | Обробник помилок: ErrorHandler, ErrorCategory, ErrorSeverity. |
| `lib/id-utils.ts` | Генерація ID (crypto.randomUUID). |
| `lib/persistent-storage.ts` | Персистентне сховище: localStorage (web) / AsyncStorage (native). |
| `lib/storage-keys.ts` | Ключі сховища (константи). |
| `lib/types.ts` | Глобальні типи. |
| `lib/utils.ts` | Загальні утиліти. |
| `lib/ui-feedback.ts` | UI feedback: toast, loading states. |
| `lib/user-settings.ts` | Налаштування користувача: тип + дефолтні значення. |
| `lib/toast-store.ts` | Zustand store для toast-повідомлень. |
| `lib/navigation-transition.ts` | View Transitions API (web). |
| `lib/button-platform.ts` | Платформна адаптація кнопок. |
| `lib/screen-container-platform.ts` | Платформна адаптація контейнера. |
| `lib/mobile-composer-layout.ts` | Layout для мобільного композитора. |
| `lib/react-native-web-interop.ts` | RN ↔ Web interop utilities. |
| `lib/web-utils.ts` | Web-утиліти: localStorage detection, URL helpers. |
| `lib/web-aria.ts` | ARIA utilities для web. |
| `lib/web-asset-store.ts` | Сховище асетів для web (IndexedDB). |
| `lib/media-library-service.ts` | Бібліотека медіа: зображення, відео. |
| `lib/splash-types.ts` | Типи для splash screen. |
| `lib/interactive-types.ts` | Типи для інтерактивних об'єктів. |

---

## 5. Стан (stores/)

| Файл | Роль |
|---|---|
| `stores/use-app-store.ts` | **Головний store**: storiesMetadata, sceneRecordsByStory, currentStoryId, playbackState, saveSlots, settings, audioLibraries, characterLibraries, language, mediaLibrary, isLoaded. Zustand + persist. |
| `stores/use-editor-store.ts` | Store редактора: поточна сцена, чернетка, історія змін (undo/redo). |
| `stores/theme-store.ts` | Store теми: поточна тема (dark/light), OKLCH palette. |
| `stores/audio-library-actions.ts` | Дії для аудіо-бібліотеки (CRUD wrapper). |
| `stores/media-library-actions.ts` | Дії для медіа-бібліотеки (CRUD wrapper). |

---

## 6. Потік даних (Reader)

```
User taps "Play"
       │
       ▼
app/reader.tsx
       │
       ├── hooks/useReaderInitialization.ts  → завантажує сторі з useAppStore
       ├── hooks/useReaderAssets.ts          → завантажує фони/персонажі
       ├── hooks/useReaderPages.ts           → обчислює сторінки
       │
       ▼
lib/engine/useSceneExecutor.ts
       │
       ├── Читает TimelineStep[] з story
       ├── Виконує крок за кроком:
       │     text/dialogue → typewriter → чекає tap
       │     choice → показує варіанти → чекає вибір
       │     background → змінює фон
       │     character → показує/ховає персонажа
       │     music/sound → AudioPlayerService
       │     effect → camera-effects
       │     variable → оновлює sceneState.variables
       │     transition → перехід до іншої сцени
       │
       ▼
components/reader/
       ├── ReaderDisplay.tsx    → текст + typewriter
       ├── ReaderControls.tsx   → кнопки
       ├── ReaderChoices.tsx    → варіанти вибору
       └── ReaderTransitions.tsx → анімації переходів
```

---

## 7. Потік даних (Editor)

```
User opens editor
       │
       ▼
app/editor.tsx або app/document-editor.tsx
       │
       ├── stores/use-editor-store.ts  → чернетка сцени
       ├── lib/editor-scene-draft.ts   → тимчасовий стан
       │
       ▼
components/editor/ або components/document-editor/
       ├── Редагування блоків (add/remove/move)
       ├── Валідація: lib/editor/block-validation.ts
       │
       ▼
lib/editor-scene-save.ts → валідація + збереження в useAppStore
```

---

## 8. Типи блоків (Block Types)

| Тип | Опис | Обробник |
|-----|------|----------|
| `text` | Простий текст (narrator) | useSceneExecutor → typewriter |
| `dialogue` | Діалог персонажа | useSceneExecutor → typewriter + character display |
| `choice` | Вибір гравця | useSceneExecutor → ReaderChoices |
| `background` | Зміна фону | useSceneExecutor → asset-resolver |
| `character` | Показати/сховати персонажа | useSceneExecutor → CharacterDisplay |
| `music` | Фонова музика | useSceneExecutor → AudioPlayerService |
| `sound` | Звуковий ефект | useSceneExecutor → AudioPlayerService |
| `transition` | Перехід до сцени | useSceneExecutor → navigation |
| `variable` | Зміна змінної | useSceneExecutor → sceneState |
| `effect` | Візуальний ефект | useSceneExecutor → camera-effects |
| `camera` | Камера (zoom/pan/focus) | useSceneExecutor → camera-effects |
| `interactive_object` | Інтерактивний об'єкт | useSceneExecutor → InteractiveObjectsLayer |

---

*Схема згенеровано: 2026-06-14*
*Попередня версія: немає (перша повна схема)*

## Пов'язані сторінки

- [[architecture-reference|Архітектура проекту]]
- [[components-reference|Components Reference]]
- [[hooks-reference|Hooks Reference]]
- [[stores-reference|Stores Reference]]
- [[block-types-reference|Block Types Reference]]
- [[audio-system|Audio System]]
- [[testing-guide|Testing Guide]]
- [[full-project-review-2026-06-14|Останній GSD аудит]]
