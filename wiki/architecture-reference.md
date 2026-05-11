# Довідник архітектури Visual Novel Engine

**Дата створення:** 2026-05-09  
**Версія проекту:** Expo 54 / React Native 0.81.5 / TypeScript 5.7.2  
**Призначення:** Повний довідник усіх файлів проекту для орієнтації будь-якої AI-моделі

---

## Структура проекту

```
visual_novel_engine/
├── app/                    # Екрани (Expo Router)
│   ├── tabs/               # Вкладки нижнього меню
│   └── oauth/              # OAuth callback
├── components/             # UI компоненти
│   ├── block-editor/       # Блочний редактор (стара система)
│   ├── lego-editor/        # LEGO редактор (нова система)
│   ├── node-editor/        # Вузловий редактор
│   ├── common/             # Спільні компоненти
│   ├── effects/            # Візуальні ефекти
│   ├── scene-editor/       # Вкладки редактора сцен
│   └── ui/                 # Базові UI компоненти
├── lib/                    # Бізнес-логіка та типи
│   └── _core/              # Інфраструктура (API, auth)
├── stores/                 # Zustand стани
├── hooks/                  # React хоки
│   └── lego/               # Хоки для LEGO-системи
├── constants/              # Константи
├── assets/                 # Статичні ресурси
├── __tests__/              # Тести (Vitest)
└── wiki/                   # Документація (Obsidian)
```

## Ключові концепції

| Концепція | Опис | Файли |
|-----------|------|-------|
| **Atom** | Примітивний блок (діалог, вибір, фон, музика) | `lib/atom-types.ts` |
| **Molecule** | Група атомів (послідовність діалогів) | `lib/molecule-types.ts` |
| **Scene** | Таймлайн з молекул та атомів | `lib/scene-types.ts` |
| **Block** | Елемент блочного редактора (стара система) | `lib/block-types.ts` |
| **Story** | Історія з сценами та виборами | `lib/types.ts` |
| **StoryGraph** | Граф зв'язків між сценами | `lib/story-graph-types.ts` |

## Шари додатку

1. **Expo Router** — навігація (Stack + Tabs)
2. **React Context** — глобальний стан (StoryProvider, ThemeProvider, I18nProvider, InventoryProvider)
3. **Zustand** — стан LEGO-системи (scene-store.ts)
4. **AsyncStorage** — персистентність
5. **NativeWind 4** — стилізація (Tailwind CSS)
6. **Reanimated 3** — анімації
7. **Gesture Handler** — жести та drag-and-drop

---

## app/ — Екрани (Expo Router)

Екрани визначають маршрутизацію додатку. Expo Router використовує файлову структуру: ім'я файлу = шлях маршруту.

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `_layout.tsx` | Кореневий layout. Обгортає додаток у провайдери (Theme, I18n, Inventory, Story) та налаштовує Stack navigator | `RootLayout` |
| `index.tsx` | Точка входу. Редирект з `/` на `/tabs` | `Index` |
| `editor.tsx` | Список історій. Створення, видалення, навігація до scene-editor/node-editor | `EditorScreen` |
| `editor-blocks.tsx` | Демо блочного редактора. Режими: tree view та canvas view | `EditorBlocksScreen` |
| `reader.tsx` | Читання історії. Ініціалізація playback, рендер сцен, обробка виборів, аудіо, інвентар | `ReaderScreen` |
| `scene-editor.tsx` | Редагування сцени. Три вкладки: Blocks, Edit, Graph. Керування медіа, виборами, блоками | `SceneEditorScreen` |
| `node-editor.tsx` | Вузловий редактор. Ліва панель: NodeCanvas, права: SceneEditorPanel | `NodeEditorScreen` |
| `save-load.tsx` | Збереження/завантаження. 10 слотів + автозбереження | `SaveLoadScreen` |
| `settings.tsx` | Налаштування: мова, гучність, швидкість тексту, темна тема | `SettingsScreen` |
| `oauth/callback.tsx` | OAuth callback. Обробка кодів авторизації, збереження сесії | `OAuthCallback` |

### app/tabs/ — Вкладки нижнього меню

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `_layout.tsx` | Конфігурація Tab navigator. Дві вкладки: Home та LEGO | `TabLayout` |
| `index.tsx` | Головний екран. Завантаження історій, demo-дані, картки історій | `HomeScreen` |
| `lego-editor.tsx` | LEGO-редактор. Canvas/Timeline/Graph режими, drag-and-drop, sidebar | `LegoEditorScreen` |

---

## components/ — UI Компоненти

### Головні компоненти

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `AnimatedBackground.tsx` | Анімовані фони для сцен (частинки, градієнти) | `AnimatedBackground` |
| `AudioLibraryManager.tsx` | Менеджер аудіо бібліотеки: CRUD, пошук, імпорт | `AudioLibraryManager` |
| `AudioTriggerEditor.tsx` | Редактор аудіо тригерів для сцен | `AudioTriggerEditor` |
| `BackgroundEffectsEditor.tsx` | Редактор фонових ефектів (дощ, сніг, туман) | `BackgroundEffectsEditor` |
| `BlockCanvas.tsx` | Canvas для блочного редактора (стара система) | `BlockCanvas` |
| `BlockNode.tsx` | Вузол блоку в canvas (стара система) | `BlockNode` |
| `BlockTreeEditor.tsx` | Дерево блоків з drag-and-drop переставлянням | `BlockTreeEditor` |
| `CharacterActionEditor.tsx` | Редактор дій персонажів (анімації, переходи) | `CharacterActionEditor` |
| `CharacterDisplay.tsx` | Відображення персонажа з анімаціями | `CharacterDisplay` |
| `CharacterLibraryManager.tsx` | Менеджер бібліотеки персонажів: CRUD, спрайти | `CharacterLibraryManager` |
| `CharacterList.tsx` | Список персонажів (виділено з CharacterLibraryManager) | `CharacterList` |
| `DesktopLayout.tsx` | Десктопний layout з sidebar для веб | `DesktopLayout`, `TopBarAction` |
| `ErrorBoundary.tsx` | React Error Boundary з fallback UI | `ErrorBoundary` |
| `InteractiveObjectsEditor.tsx` | Редактор інтерактивних об'єктів у сценах | `InteractiveObjectsEditor` |
| `InteractiveObjectsLayer.tsx` | Шар інтерактивних об'єктів у читачі | `InteractiveObjectsLayer` |
| `InventoryUI.tsx` | UI інвентарю гравця | `InventoryUI` |
| `ItemNotification.tsx` | Сповіщення про отримання предмета | `ItemNotification` |
| `LanguageSelector.tsx` | Вибір мови (UK/EN/RU/PL) | `LanguageSelector` |
| `LazyImage.tsx` | Ліниве завантаження зображень з placeholder | `LazyImage` |
| `PaginationControls.tsx` | Елементи керування пагінацією | `PaginationControls` |
| `ReaderMenu.tsx` | Меню читача (збереження, налаштування, назад) | `ReaderMenu` |
| `SafeText.tsx` | Безпечний текстовий компонент з fallback | `SafeText` |
| `ShortcutHint.tsx` | Відображення клавіатурних скорочень | `ShortcutHint` |
| `SnippetLibrary.tsx` | Бібліотека сніпетів (збережених блоків) | `SnippetLibrary` |
| `SplashScreen.tsx` | Екран-заставка з анімаціями | `SplashScreen` |
| `SplashScreenEditor.tsx` | Редактор екранів-заставок | `SplashScreenEditor` |
| `WebFilePicker.tsx` | Вибір файлів для веб-платформи | `WebFilePicker` |
| `WebSidebar.tsx` | Бічна панель для веб-версії | `WebSidebar` |
| `WebTopBar.tsx` | Верхня панель для веб-версії | `WebTopBar` |
| `dialogue-history.tsx` | Історія діалогів у читачі | `DialogueHistory` |
| `external-link.tsx` | Зовнішнє посилання (відкривається в браузері) | `ExternalLink` |
| `haptic-tab.tsx` | Tab кнопка з тактильним відгуком | `HapticTab` |
| `hello-wave.tsx` | Анімована хвиля (демо) | `HelloWave` |
| `media-library.tsx` | Менеджер медіа бібліотеки: зображення, аудіо | `MediaLibrary`, `LibraryAsset`, `addAssetToLibrary`, `getLibraryAssets` |
| `parallax-scroll-view.tsx` | ScrollView з паралакс-ефектом | `ParallaxScrollView` |
| `scene-graph.tsx` | Візуалізація графу сцен (міні-карта) | `SceneGraph` |
| `screen-container.tsx` | Контейнер екрану з безпечною зоною | `ScreenContainer` |
| `story-reader-responsive.tsx` | Адаптивний читач історій | `StoryReaderResponsive` |
| `story-reader.tsx` | Базовий читач історій | `StoryReader` |
| `themed-view.tsx` | View з тематичними кольорами | `ThemedView` |

### components/block-editor/ — Блочний редактор (стара система)

Візуальний редактор блоків з drag-and-drop, з'єднаннями та палітрою.

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `BlockCard.tsx` | Карточка блоку з drag handle | `BlockCard` |
| `BlockConfigPanel.tsx` | Панель налаштування вибраного блоку | `BlockConfigPanel` |
| `BlockConnectionPort.tsx` | Порт з'єднання між блоками | `BlockConnectionPort` |
| `BlockFlowCanvas.tsx` | Canvas з'єднаних блоків (flow chart) | `BlockFlowCanvas` |
| `BlockPalette.tsx` | Палітра блоків для додавання | `BlockPalette` |
| `BlockPickerModal.tsx` | Модальне вікно вибору блоку | `BlockPickerModal` |
| `BlockToolbar.tsx` | Панель інструментів блочного редактора | `BlockToolbar` |
| `types.ts` | Типи блочного редактора, SCENE_COLORS | `EditorBlock`, `Connection`, `SCENE_COLORS` |

### components/lego-editor/ — LEGO редактор (нова система)

Нова візуальна система на основі атомів та молекул.

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `AtomBlockComponent.tsx` | Компонент атома на canvas (рендер, drag) | `AtomBlockComponent` |
| `LegoCanvas.tsx` | Canvas з drag-and-drop атомами та snap-ефектом | `LegoCanvas`, `DraggableAtom` |
| `StoryGraph.tsx` | Граф сюжету (вузли + зв'язки) | `StoryGraph` |
| `TimelineEditor.tsx` | Таймлайн редактор з послідовністю подій | `TimelineEditor` |

### components/node-editor/ — Вузловий редактор

Професійний node-based редактор для картування потоку історії.

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `NodeCanvas.tsx` | Canvas з вузлами сцен та зв'язками | `NodeCanvas` |
| `SceneEditorPanel.tsx` | Панель редагування обраної сцени | `SceneEditorPanel` |
| `StoryNode.tsx` | Вузол сцени на canvas | `StoryNode` |
| `types.ts` | Типи вузлового редактора | `NodeEditorNode`, `NodeEditorEdge` |

### components/common/ — Спільні компоненти

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `Tooltip.tsx` | Спливаюча підказка | `Tooltip` |
| `TourGuide.tsx` | Інтерактивний тур по додатку | `TourGuide` |

### components/effects/ — Візуальні ефекти

Анімовані фонові ефекти для сцен.

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `BackgroundEffectsManager.tsx` | Менеджер всіх ефектів, рендерить активні | `BackgroundEffectsManager` |
| `FogEffect.tsx` | Ефект туману | `FogEffect` |
| `ParticlesEffect.tsx` | Ефект частинок | `ParticlesEffect` |
| `RainEffect.tsx` | Ефект дощу | `RainEffect` |
| `SnowEffect.tsx` | Ефект снігу | `SnowEffect` |
| `SparklesEffect.tsx` | Ефект іскор | `SparklesEffect` |
| `StormEffect.tsx` | Ефект грози | `StormEffect` |
| `SunraysEffect.tsx` | Ефект сонячних променів | `SunraysEffect` |

### components/scene-editor/ — Вкладки редактора сцен

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `BlocksTab.tsx` | Вкладка блоків (BlockFlowCanvas + BlockToolbar) | `BlocksTab` |
| `EditTab.tsx` | Вкладка редагування (текст, фон, аудіо, вибори) | `EditTab` |
| `GraphTab.tsx` | Вкладка графу (SceneGraph) | `GraphTab` |

### components/ui/ — Базові UI компоненти

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `Button.tsx` | Кнопка з варіантами стилів | `Button` |
| `collapsible.tsx` | Згортаний контейнер | `Collapsible` |
| `icon-symbol.tsx` | SF Symbol іконка (iOS/Android) | `IconSymbol` |

---

## lib/ — Бізнес-логіка, типи та утиліти

### lib/_core/ — Інфраструктура

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `api.ts` | HTTP API клієнт з платформозалежною авторизацією (Bearer token / cookie) | `apiCall()`, `exchangeOAuthCode()`, `logout()`, `getMe()`, `establishSession()` |
| `auth.ts` | Зберігання сесійних токенів (SecureStore на native, localStorage на web) | `getSessionToken()`, `setSessionToken()`, `removeSessionToken()`, `getUserInfo()`, `setUserInfo()`, `clearUserInfo()` |
| `manus-runtime.ts` | Комунікація з батьківським контейнером (Manus/iframe), safe area insets | `initManusRuntime()`, `isRunningInPreviewIframe()`, `subscribeSafeAreaInsets()` |
| `nativewind-pressable.ts` | Патч NativeWind Pressable (side-effect модуль, не експортує нічого) | — |
| `theme.ts` | Побудова палітр кольорів з theme.config, шрифти за платформою | `ThemeColors`, `SchemeColors`, `Colors`, `Fonts`, `ColorScheme` |

### lib/ — Основні модулі

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `app-context.tsx` | Глобальний контекст: завантаження, сповіщення, модали, помилки, мережа | `AppProvider`, `useApp()`, `AppState`, `Notification` |
| `asset-resolver.ts` | Резолв URI для зображень, аудіо, відео (bundle://, file://, http, relative) | `getBundledAsset()`, `resolveAssetUri()`, `copyAssetToPermanentStorage()` |
| `atom-types.ts` | Типи атомів (найменших блоків) + Zod-схеми + snap-точки | `AtomType`, `AtomBlock`, `AtomData`, `SnapPoint`, `TextAtomData`, `CharacterAtomData`, `BackgroundAtomData`, `AudioAtomData`, `FXAtomData`, `createAtom()` |
| `audio-library.ts` | CRUD аудіо бібліотеки (AsyncStorage) | `getAudioLibrary()`, `saveAudioLibrary()`, `addAudioToLibrary()`, `updateAudioInLibrary()`, `deleteAudioFromLibrary()`, `searchAudioLibrary()` |
| `audio-manager-enhanced.ts` | Синглтон аудіо менеджера з тригерами, fade, crossfade | `enhancedAudioManager`, `AudioManager`; клас `EnhancedAudioManager` з `play()`, `pause()`, `stop()`, `crossFade()`, `executeTrigger()` |
| `audio-types.ts` | Типи аудіо системи: бібліотека, тригери, playback | `AudioTriggerType`, `AudioLibraryItem`, `AudioTrigger`, `StorySceneExtended`, `AudioPlaybackState` |
| `background-effects-types.ts` | Типи та пресети фонових ефектів | `BackgroundEffectType`, `BackgroundEffect`, `EffectPreset`, `EFFECT_PRESETS` + конфіги для кожного ефекту |
| `block-registry.ts` | Реєстр блоків з метаданими (label, icon, category, colors) | `BLOCK_REGISTRY`, `BLOCK_CATEGORIES`, `getBlocksByCategory()`, `getBlockEntry()` |
| `block-schemas.ts` | Zod-схеми валідації для кожного типу блоку | `dialogueSchema`, `narrationSchema`, `choiceSchema`, `validateBlockData()` + інші схеми |
| `block-tree.ts` | Незмінні операції з деревом блоків (Immer) | `addBlockAtPath()`, `deleteBlockAtPath()`, `moveBlock()`, `duplicateBlock()`, `updateBlockData()`, `flattenTree()` |
| `block-types.ts` | Типи блоків: BlockType, Block, константи сітки | `BlockType`, `Block`, `BlockCategory`, `ROOT_BLOCK`, `GRID_SIZE`, `SNAP_TO_GRID`, `createDefaultBlock()` |
| `character-animator.ts` | RN Animated анімації для персонажів (show/hide/move/shake) | `createCharacterAnimation()`, `createScreenShakeAnimation()`, `createHideAnimation()`, `createAnimatedInstance()` |
| `character-library.ts` | CRUD бібліотеки персонажів (AsyncStorage) | `getCharacterLibrary()`, `addCharacter()`, `updateCharacter()`, `deleteCharacter()`, `addSpriteToCharacter()` |
| `character-types.ts` | Типи персонажів: спрайти, позиції, анімації, дії | `CharacterSprite`, `Character`, `CharacterPosition`, `CharacterAnimation`, `CharacterInstance`, `CharacterAction` |
| `error-handler.ts` | Централізована обробка помилок з рівнями, категоріями, retry | `ErrorHandler`, `AppError`, `ErrorSeverity`, `ErrorCategory`, `retryAsync()` |
| `i18n-context.tsx` | Контекст інтернаціоналізації: мови, переклади, t() | `I18nProvider`, `useI18n()`, `SUPPORTED_LANGUAGES`, `getLanguageInfo()` |
| `interactive-types.ts` | Типи інтерактивних об'єктів, дій, пресети | `InteractiveObject`, `InteractiveAction`, `InventoryItem`, `INTERACTIVE_PRESETS` |
| `inventory-context.tsx` | Контекст інвентарю гравця (AsyncStorage) | `InventoryProvider`, `useInventory()` |
| `legacy-migration.ts` | Міграція старих Block → Atom/Molecule система | `migrateBlockToAtoms()`, `migrateBlocksToScene()` |
| `molecule-types.ts` | Типи молекул (груп атомів), Zod-схеми, snap | `MoleculeType`, `MoleculeBlock`, `moleculeSchema`, `validateAtomsForMolecule()`, `calculateBounds()`, `canSnap()`, `createMolecule()` |
| `pagination.ts` | Хоки пагінації: стандартна, нескінченна, з пошуком | `usePagination()`, `useInfiniteScroll()`, `useSearchablePagination()`, `useSortablePagination()` |
| `responsive.ts` | Адаптивні утиліти: брейкпоінти, spacing, шрифти | `BREAKPOINTS`, `getResponsiveValues()`, `getResponsiveSpacing()`, `getResponsiveFontSize()`, `getReaderLayout()` |
| `scene-groups.ts` | Виявлення кластерів блоків (Union-Find алгоритм) | `SceneGroup`, `detectSceneGroups()`, `assignSceneIds()` |
| `scene-persistence.ts` | Автозбереження сцен, експорт/імпорт JSON | `useAutoSave()`, `exportScene()`, `importScene()`, `exportAllScenes()`, `importAllScenes()` |
| `scene-types.ts` | Тип сцени з timeline та atoms/molecules | `TimelineEvent`, `Scene`, `createScene()` |
| `splash-types.ts` | Типи splash-екранів та анімованих фонів | `SplashScreenConfig`, `AnimatedBackground`, `UITransition`, `SPLASH_PRESETS` |
| `state-logger.ts` | Дев-логування змін стану (тільки в __DEV__) | `StateLogger`, `withLogging()` |
| `storage-keys.ts` | Централізовані ключі AsyncStorage (префікс vne_) | `STORAGE_KEYS`, `StorageKey`, `getAllStorageKeys()` |
| `storage.ts` | Збереження/завантаження дерева блоків | `saveTreeToStorage()`, `loadTreeFromStorage()` |
| `story-context-enhanced.ts` | Розширене редагування історій (update/add/delete scene/choice) | `updateStory()`, `updateScene()`, `addScene()`, `deleteScene()`, `addChoice()`, `deleteChoice()`, `exportStory()`, `importStory()` |
| `story-context.tsx` | Головний контекст: stories, playback, save/load, settings | `StoryProvider`, `useStoryState()`, `useStoryActions()`, `useStory()` |
| `story-domain.ts` | Доменна логіка: метадані, слоти збереження | `StoryMetadata`, `StoryDomain.extractMetadata()`, `StoryDomain.createSaveSlot()` |
| `story-graph-types.ts` | Типи графу історії (вузли + ребра) | `StoryNode`, `StoryEdge`, `StoryGraph` |
| `story-repository.ts` | Репозиторій даних: AsyncStorage + retry + міграція | `StoryRepository.getAllStoriesMetadata()`, `StoryRepository.saveStory()`, `StoryRepository.getSaveSlots()` |
| `story-validator.ts` | Валідація імпортованих історій (XSS, circular refs) | `ValidationError`, `StoryValidator`, `validateImportedStory()` |
| `theme-provider.tsx` | Провайдер теми: NativeWind, RN Appearance, CSS змінні | `ThemeProvider`, `useThemeContext()` |
| `trpc.ts` | tRPC клієнт з auth | `trpc`, `createTRPCClient()` |
| `types.ts` | Головні доменні типи: Story, StoryScene, Choice, SaveSlot | `Choice`, `CharacterSprite`, `StoryScene`, `Story`, `SaveSlot`, `UserSettings`, `PlaybackState`, `Asset` |
| `ui-feedback.ts` | Тактильний відгук та звукові ефекти UI | `playHaptic()`, `buttonFeedback()`, `successFeedback()`, `errorFeedback()` |
| `ui-transition-manager.ts` | Керування переходами UI (fade/slide) | `UITransitionManager` |
| `utils.ts` | Утиліта clsx + tailwind-merge | `cn()` |
| `web-utils.ts` | Веб-утиліти: платформа, клавіатура, файли, clipboard | `isWeb()`, `isWebDesktop()`, `fileToDataUri()`, `copyToClipboard()`, `getBrowserName()` |

---

## stores/ — Zustand Стан

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `scene-store.ts` | Zustand стан LEGO-системи: поточна сцена, атоми, молекули, вибір, snap | `useSceneStore` (містить `currentSceneId`, `atoms`, `molecules`, `addAtom()`, `updateAtom()`, `deleteAtom()`, `addMolecule()`, `selectAtom()`, `setSnapEnabled()`) |

---

## hooks/ — React Хоки

### hooks/lego/ — Хоки LEGO-системи

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `useLegoDnD.ts` | Drag-and-drop логіка для LEGO canvas (Reanimated + Gesture Handler) | `useLegoDnD()` |
| `useLegoTabs.ts` | Управління вкладками Canvas/Timeline/Graph | `useLegoTabs()` |
| `useSceneManagement.ts` | Управління списком сцен (add/delete/rename/select) | `useSceneManagement()` |

### hooks/ — Загальні хоки

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `use-auth.ts` | Хока авторизації з OAuth | `useAuth()` |
| `use-color-scheme.ts` | Визначення світлої/темної схеми | `useColorScheme()` |
| `use-colors.ts` | Отримання поточних кольорів теми | `useColors()` |
| `use-file-picker.ts` | Вибір файлів (image/document picker) | `useFilePicker()` |
| `use-keyboard-shortcuts.ts` | Обробка клавіатурних скорочень | `useKeyboardShortcuts()` |
| `useAutoSave.ts` | Автозбереження з інтервалом | `useAutoSave()` |
| `useReaderAudio.ts` | Аудіо для читача (BGM, голос, SFX) | `useReaderAudio()` |
| `useResponsiveLayout.ts` | Адаптивний layout (телефон/планшет/десктоп) | `useResponsiveLayout()` |
| `useSceneEditorActions.ts` | Дії редактора сцен (збереження, видалення) | `useSceneEditorActions()` |
| `useSceneEditorMedia.ts` | Медіа для редактора сцен (зображення, аудіо) | `useSceneEditorMedia()` |

---

## constants/ — Константи

| Файл | Призначення | Ключові експорти |
|------|-------------|-------------------|
| `const.ts` | Глобальні константи (назва додатку, ліміти) | `APP_NAME`, константи |
| `oauth.ts` | OAuth конфігурація (client ID, redirect URI, API URL) | OAuth константи |
| `theme.ts` | Конфігурація теми (кольори, шрифти) | Тематичні константи |

---

## Потік даних

```
User Action → Screen (app/) → Component (components/)
                                    ↓
                          Hook (hooks/) → Context (lib/*-context.tsx)
                                    ↓
                          Zustand Store (stores/) → AsyncStorage
                                    ↓
                          Repository (lib/*-repository.ts) → AsyncStorage
```

### Ключові потоки:

1. **Створення історії**: `editor.tsx` → `StoryProvider` → `story-context-enhanced.ts` → `AsyncStorage`
2. **Читання історії**: `reader.tsx` → `StoryProvider` → `audio-manager-enhanced.ts` → `expo-audio`
3. **LEGO-редагування**: `lego-editor.tsx` → `useSceneManagement` → `scene-store.ts` → `AsyncStorage`
4. **Блочне редагування**: `scene-editor.tsx` → `BlockFlowCanvas` → `block-tree.ts` → `storage.ts`

---

## Конфігураційні файли

| Файл | Призначення |
|------|-------------|
| `app.config.js` | Конфігурація Expo (назва, іконка, плагіни) |
| `babel.config.cjs` | Babel: expo preset + NativeWind + **Reanimated plugin** + Worklets |
| `metro.config.js` | Metro bundler конфігурація |
| `tailwind.config.js` | Tailwind CSS конфігурація |
| `tsconfig.json` | TypeScript: шляхи (@/), strict mode |
| `vitest.config.ts` | Vitest: моки, аліаси, coverage |
| `package.json` | Залежності, скрипти |

---

## Важливі зауваження для AI-моделей

1. **Reanimated plugin** ОБОВ'ЯЗКОВИЙ у `babel.config.cjs`. Без нього додаток крашиться з білим екраном.
2. **Файлова маршрутизація**: Expo Router використовує структуру папок. `app/tabs/lego-editor.tsx` = маршрут `/tabs/lego-editor`.
3. **Дві системи редагування**: стара (Block) та нова (Atom/Molecule/Scene). LEGO — нова.
4. **Провайдери** обгортають додаток у `_layout.tsx` у порядку: GestureHandler → Theme → I18n → Inventory → Story.
5. **AsyncStorage** — єдине сховище. Усі дані зберігаються з префіксом `vne_` (див. `storage-keys.ts`).
6. **pnpm на WSL/NTFS** може ламати симлінки. Якщо `expo-asset` не знаходиться — перевір симлінк.
7. **Тести**: 219/219 (Vitest). Конфігурація у `vitest.config.ts` з моками для RN модулів.
8. **WSL2 + Expo Go**: LAN mode не працює. Використовувати `--tunnel`.

---

## Пов'язані сторінки
- [[runtime-fixes-2026-05-09|Виправлення runtime-помилок 2026-05-09]]
- [[testing-plan-2026-05-09|План тестування 2026-05-09]]
- [[next-session-plan-2026-05-10|План на сесію 2026-05-10]]
- [[lego-block-system-plan-2026-05-07|План реалізації LEGO-системи]]
- [[code-analysis-report-2026-05-07|Аналіз коду 2026-05-07]]
- [[SCHEMA|Схема даних]]
- [[log|Журнал подій]]
- [[index|Головна сторінка Wiki]]
