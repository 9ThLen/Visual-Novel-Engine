# Повний аналіз VNE проекту — 2026-06-01

## 1. Загальна метрика проекту

### Розмір кодова база (без node_modules, .expo, android, .git)

| Категорія          | Файлів | LOC (орієнтовно) |
|--------------------|--------|-------------------|
| lib/               | ~65    | ~8,632            |
| components/        | ~35    | ~11,584           |
| app/               | ~17    | ~1,500            |
| stores/            | 3      | ~833              |
| hooks/             | 8      | ~300              |
| constants/         | 2      | ~50               |
| **Всього**         | ~130   | **~22,900**       |

### Найбільші файли (LOC)

| Файл                                              | LOC  |
|---------------------------------------------------|------|
| components/document-editor/DocumentSceneEditor.tsx| 1394 |
| components/editor/PropertiesPanel.tsx             | 1089 |
| components/story-reader-responsive.tsx            | 630  |
| components/editor/SceneSelector.tsx               | 565  |
| components/editor/SceneComposer.tsx               | 510  |
| components/editor/modals/AssetPicker.tsx          | 491  |
| app/tabs/index.tsx                                | 488  |
| components/editor/SceneManager.tsx                | 484  |
| components/editor/TimelinePanel.tsx               | 456  |
| components/editor/modals/SaveSceneDialog.tsx      | 401  |
| lib/translations.ts                               | 695  |
| lib/scene-operations.ts                           | 423  |
| lib/engine/types.ts                               | 378  |
| lib/document-editor/document-scene.ts             | 360  |
| lib/engine/useSceneExecutor.ts                    | 329  |
| lib/asset-resolver.ts                             | 312  |

### Висновки по масштабу

- Проект **~23K LOC** — середній розмір для Expo/RN додатку
- **DocumentSceneEditor** (1394 LOC) — чіткий God Component, потребує декомпозиції
- **PropertiesPanel** (1089 LOC) — величезний компонент з switch-case для 12 типів блоків
- **StoryReaderResponsive** (630 LOC) — містить 30+ хуків, є God Component
- **SceneComposer** (510 LOC) — дві окремі розмітки (phone/desktop) в одному файлі
- **SceneSelector** (565 LOC) — потребує аналізу

---

## 2. Архітектура проекту

### 2.1 Загальна структура

```
app/                    → Expo Router screens (UI шари)
components/             → React компоненти (UI)
  editor/               → Компоненти редактора (SceneComposer, PropertiesPanel, ...)
  document-editor/      → DocumentSceneEditor (Google Docs-подібний редактор)
  reader/               → Компоненти читалки
  ui/                   → Базові UI компоненти (Button, ConfirmDialog, collapsible)
  modals/               → Модальні вікна (AssetPicker, CharacterCreator, SaveSceneDialog)
lib/                   	→ Бізнес-логіка, типи, сервіси
  engine/               → Новий рушій: types.ts, useSceneExecutor.ts, event-factory.ts
  document-editor/      → Логіка document-editor: document-scene.ts, commands.ts, types.ts
  editor/               → Логіка редактора: block-validation.ts, timeline-sortable.ts, story-manuscript*.ts
  _core/                → Ядро: api.ts, auth.ts, theme.ts
  audio-*.ts            → Аудіо підсистема (~6 файлів)
stores/                 → Zustand stores: use-app-store.ts, use-editor-store.ts, theme-store.ts
hooks/                  → React hooks: useColors, useTypewriter, useReaderAudio, useAutoSave, ...
constants/              → theme.ts, oauth.ts
```

### 2.2 Потік даних

```
[app/tabs/index.tsx] → useStoryState() → useAppStore (Zustand, persist)
                                              ↓
[app/editor.tsx] → useEditorStore (Zustand, in-memory)
                         ↓
[app/reader.tsx] → useReaderInitialization → useSceneExecutor
                         ↓
[DocumentSceneEditor] → document-scene.ts → TimelineStep[] → engine/useSceneExecutor
```

### 2.3 Модель даних (еволюція)

Проект пройшов через міграцію:

**Legacy** (deprecated):
- `Story` (scene-operations.ts) → `id, title, scenes: Record<string, StoryScene>`
- `StoryScene` → `id, text, choices: Choice[], backgroundImageUri`
- `Choice` → `id, text, nextSceneId`

**Canonical** (поточна):
- `StoryMetadata` (story-domain.ts) → `id, title, startSceneId, sceneCount`
- `SceneRecord` (engine/types.ts) → `id, storyId, name, timeline: TimelineStep[], connections`
- `TimelineStep` → `id, blockType, data: BlockData, collapsed, enabled, conditions`
- `BlockData` — union type з 13 варіантів (BackgroundBlockData, CharacterBlockData, ...)

**Проблема**: і legacy і canonical моделі все ще існують паралельно. Legacy типи використовуються для:
- `importStory()` — імпорт JSON з legacy формату
- `migrateFromLegacyKeys()` — міграція зі старого формату зберігання
- `addStory()` метод в store (deprecated)
- Demo story JSON файли завантажуються як `as unknown as Story`

---

## 3. Аналіз підсистем

### 3.1 Theme / Design System

**Архітектура**:
- OKLCH кольори в `constants/theme-colors.json` → конвертація в hex/rgba при збірці через `oklchToRgb()`
- 3-рівнева токенів: Primitive → Semantic → Component (згадується в DESIGN_SYSTEM.md)
- RuntimePalette — розширена палітра з legacy aliases (`muted`, `error`, `text-inverse`)
- `Colors.dark` / `Colors.light` — збудовані при старті, кешуються

**Проблеми**:

1. **Hardcoded кольори в SceneComposer** (Критичне): Десктопна розмітка використовує 15+ hardcoded hex кольорів (`#f8f9fb`, `#e3e6eb`, `#252a32`, `#ffffff`, `#2667d9`, `#1f4f9f`, `#cbd8ef`, `#eef4ff`, `#7b828d`). Dark theme ламається для всіх desktop-surface.

2. **Hardcoded кольори в SceneComposer phone** (Помірне): `rgba(15,14,23,0.92)`, `rgba(15,14,23,0.95)`, `rgba(124,58,237,0.12)`, `rgba(124,58,237,0.25)` в lib/_core/theme.ts як fallback.

3. **Hardcoded reader container** (Помірне): `lib/story-reader-platform.ts` використовує hardcoded `colors.surface` для контейнера.

4. **Консольний лог в theme-store** (Ниський): `__DEV__` тільки для hydration, але `console.warn` та `console.log` не приховані в `onRehydrateStorage` на production.

5. **`document.querySelector` без Platform guard** (Помірне): `SceneComposer.tsx:262-263` — `document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()` без `Platform.OS === 'web'` guard. На native — crash.

### 3.2 State Management

**Архітектура**:
- 3 Zustand stores: `useAppStore` (persist), `useEditorStore` (in-memory), `useThemeStore` (persist)
- `useAppStore` використовує `persist` middleware з `createPersistentStorage`
- Міграція з legacy ключів: `migrateFromLegacyKeys()` → зчитування окремих ключів → конвертація в canonical
- `useStoryState()` / `useStoryActions()` — convenience wrappers над `useAppStore`

**Проблеми**:

1. **God Store** (Архітектурне): `useAppStore` — 473 LOC, 18 полів стану, 15 actions. Містить: stories, scenes, playback, save slots, settings, libraries, migration. Consolidation необхідний.

2. **`addStory` напряму викликає setState з `useEditorStore.getState()` в SceneComposer** (Помірне): `SceneComposer.tsx:199` — прямий виклик `appState.saveSceneRecord(record)` з `useAppStore.getState()` замість через hook/store. Функціонально працює, але порушує Zustand pattern.

3. **`useStoryState()` створює об'єкти на кожен render** (Performanсне): `buildCanonicalScene()` викликається для кожної story на кожен render будь-якого компонента, що використовує `useStoryState()`. Це створює ~N нових об'єктів де N = кількість story.

4. **Duplicate state: `reorderScenes` не змінює порядок** (Bug): `stores/use-app-store.ts:424-433` — `reorderScenes` просто оновлює `updatedAt` для кожного scene, але не змінює фактичний порядок. Порядок визначається ключі Record, які не гарантують порядок.

5. **Console logs без __DEV__** (Помірне): `app/tabs/index.tsx:213,228,233` — `console.log('[DIAG] ...')` не горнуті в `if (__DEV__)`.

### 3.3 Engine / Executor

**Архітектура**:
- `useSceneExecutor` — React hook для покрокового виконання timeline
- `TimelineStep` → 13 типів блоків → switch-case в `executeStep`
- Yielding blocks (text, dialogue, choice, transition) — зупиняють виконання
- Conditions — `conditionsMet()` перевіряє змінні
- Variables — `evaluateVariable()` з захистом від prototype pollution (RESERVED_KEYS)

**Проблеми**:

1. **No-op блоки без сповіщення** (Критичне UX): `sound`, `camera`, `interactive_object` мають `console.warn` але жодного UI-сповіщення. Користувач може додати блоки в редакторі, зберегти, запустити — і нічого не станеться.

2. **No-op блоки доступні в UI** (Критичне UX): `BlockLibraryPanel` показує всі 13 типів, але 3 з них — пусті. Користувач не знає, що ці блоки не працюють.

3. **`executeStep` обгорнутий в try-catch, але помилка тільки логується** (Помірне): Corrupted data не зупиняє execution, але і не повідомляє користувача. Scene просто пропускає крок.

4. **`processNext` викликається в `useEffect` без cleanup** (Performanсне): Якщо timeline зміниться під час виконання async `processNext`, race condition.

5. **`isTyping` в executor не синхронізований з typewriter** (Bug): Executor знає `isTyping` тільки для `text`/`dialogue` (визначається в `result === 'halt'`). Але фізичний typewriter effect в `StoryReaderResponsive` — окремий `useTypewriter hook`. Може виникнути стан, коли executor думає що text завершений, а typewriter ще печатає.

### 3.4 Document Editor (DocumentSceneEditor)

**Архітектура**:
- Google Docs-подібний текстовий редактор
- DocumentBlock → конвертація в/з TimelineStep
- `/` команда palette через `searchDocumentCommands`
- Автоматична конвертація тексту в блоки (dialogue, character, narration)
- Page-based навігація

**Проблеми**:

1. **God Component — 1394 LOC** (Критичне архітектурне): Містить: 20+ useState, 5+ useEffect, 3+ useRef, 6+ useCallback. Відповідає за: text editing, page navigation, command palette, keyboard handling, scroll management, auto-conversion, save logic. Потребує декомпозиції на 5+ підкомпонентів.

2. **Scroll-to-bottom на кожен фокус/зміну контенту** (Критичне UX): `followWriting()` викликається в:
   - `onContentSizeChange` (рядок 1174)
   - `onFocus` на всіх TextInput
   - initDocumentScene
   - addLine/addBlock handlers
   Це спричиняє стрибання viewport вниз при кожному натисканні або зміні тексту.

3. **Fixed minHeight на сторінках** (Помірне UX): `minHeight: pageMinHeight` — сторінки завжди розтягуються на весь viewport, створюючи "page" feel замість continuous flow (як Google Docs).

4. **`document.querySelector` в keyboard handler** (Bug на native): `DocumentSceneEditor.tsx` використовує `document.querySelector('[data-search-input]')` без Platform guard. На native — crash.

### 3.5 Безпека

**Поточний стан** (переважно після фіксів 2026-05-31):
- ✅ OAuth state validation (exchangeOAuthCode)
- ✅ Prototype pollution (RESERVED_KEYS)
- ✅ Rate limiting (api.ts)
- ✅ sessionStorage замість localStorage для auth
- ✅ crypto.getRandomValues для ID generation
- ✅ URI validation (isSafeUri)

**Залишивсьі проблеми**:

1. **`data: any` в story-validator.ts** (Помірне): `validateStory(data: any)`, `validateScene(data: any)`, `validateChoice(data: any)`. Приймає будь-які дані без валідації типу на вході. Для legacy import — прийнятно, але краще використовіть `unknown` з type narrowing.

2. **Canonical import без повної валідації** (Помірне): `importStory()` перевіряє тільки структуру (title, scenes, timeline), але не валідує вміст TimelineStep (blockType, data fields, URI safety). Зламаний timeline може потрапити в store.

3. **CSP відсутній** (Помірне): `app/+html.tsx` не містить Content-Security-Policy meta tag.

4. **Demo story JSON без валідації** (Помірне): `demo-story.json` і `demo-story-advanced.json` завантажуються як `as unknown as Story` — подвійний cast без жодної валідації. Якщо JSON структура зміниться — runtime crash без зрозумілого повідомлення.

5. **Unguarded console.log в API** (Низьке): `lib/_core/api.ts:64,67,70,78,89,91,98,103,117,122` — багато console.log з даними запитів. Хоча вони в `__DEV__`, деякі логують headers та URL.

### 3.6 Аудіо підсистема

**Архітектура**:
- 6 файлів: audio-types.ts, audio-interfaces.ts, audio-library.ts, audio-library-service.ts, audio-player-service.ts, audio-manager-enhanced.ts, audio-trigger-scheduler.ts, audio-web-source.ts
- `enhancedAudioManager` — основний менеджер
- `useReaderAudio` — hook для reader screen
- `resolvePlayableAssetUri` — резолв з bundled/external/file джерел

**Проблеми**:

1. **Promise leak в audio-player-service.ts** (Помірне): `fadeOut()` створює Promise який може ніколи не резолвнутись якщо track видалений до завершення fade.

2. **Console.log в audio-player-service.ts** (Низьке): `console.log('[AudioPlayerService] ...')` без `__DEV__` guard.

### 3.7 Навігація / Routing

**Архітектура**:
- Expo Router з file-based routing
- `app/tabs/_layout.tsx` → `app/tabs/index.tsx` (home)
- `/editor`, `/reader`, `/play`, `/preview`, `/document-editor`, `/scene-editor`, `/scene-manager`, `/manuscript-editor`, `/settings`, `/save-load`, `/oauth/callback`

**Проблеми**:

1. **`useFocusEffect` з `@react-navigation/native`** (Помірне): `app/tabs/index.tsx:13` — імпорт з `@react-navigation/native` замість `expo-router`. В проекті з Expo Router це може спричинити конфлікт версій.

2. **Невикористані роути** (Dead code): `/scene-editor`, `/scene-manager`, `/manuscript-editor`, `/save-load`, `/settings` — потрібно перевірити чи вони підключені.

3. **`router.push() as never`** (TypeScript anti-pattern): Багато викликів `router.push({ pathname: '/document-editor', params: ... } as never)` — `as never` приховує помилки типів.

---

## 4. UI/UX Аналіз

### 4.1 Що працює добре

- **Design System**: OKLCH-based, 61 токен, 3-рівнева архітектура — сучасний підхід
- **Dark/Light theme**: Працює для основних компонентів через `useColors()` hook
- **Reader UX**: Typewriter effect, auto-play, turbo skip, dialogue history, choices — повний набір VN функцій
- **Editor UX**: 3-panel layout (desktop), phone-adaptive layout, undo/redo, block library, properties panel
- **Document Editor**: Google Docs-подібний досвід з `/` командами
- **Accessibility**: Більшість інтерактивних елементів мають `accessibilityRole`, `accessibilityLabel`
- **ErrorBoundary**: Кореневий error boundary в `_layout.tsx`
- **MigrationErrorBanner**: Візуальне сповіщення про помилки міграції

### 4.2 Критичні UX проблеми

1. **Document Editor scroll jumping** — найгірший UX баг. Кожен клік на TextInput → scroll to bottom. Редагування тексту стає неможливим для довгих документів.

2. **No-op блоки** — користувач витрачає час на налаштування `sound`, `camera`, `interactive_object` блоків, а вони нічого не роблять. Це обман очікувань.

3. **Page-based document feel** — `minHeight: pageMinHeight` створює штучні сторінки замість continuous flow.

4. **Desktop editor з hardcoded кольорами** — dark theme повністю ламає десктопний редактор.

### 4.3 Помірні UX проблеми

1. **Loading state без прогресу** — `initializeApp` з 8-секундним timeout, але без індикатора прогресу
2. **No auto-save indicator в Document Editor** — користувач не знає чи збережено
3. **Phone layout SceneComposer** — 5 табів в одну лінію на маленьких екранах (Blocks, Timeline, Preview, Document, Scenes)
4. **PropertiesPanel** — 1089 LOC з 12 різними формами — занадто довгий скрол
5. **AssetPicker** — 491 LOC модалка з усіма категоріями в одному файлі

### 4.4 Accessibility прогали

1. **Touch targets**: Деякі кнопки в SceneComposer phone layout менше 44x44px
2. **Color contrast**: `#7b828d` text на `#f8f9fb` background — може не відповідати WCAG AA
3. **Screen reader**: `StoryReaderResponsive` — основна область тексту має `accessibilityRole="button"` що може плутати читач екрану
4. **Focus management**: Document Editor не має proper focus trap для command palette

---

## 5. Продуктивність

### 5.1 Потенційні проблеми

1. **`useStoryState()` створює об'єкти на кожен render** — кожен компонент що використовує цей hook створює копії `buildCanonicalStory()` на кожен render
2. **`useSceneExecutor` — `timelineKey` через `JSON.stringify`** — серіалізація всього timeline на кожен рендер для порівняння
3. **`DocumentSceneEditor` — 1394 LOC компонент** — будь-яка зміна стану перерендерює весь компонент
4. **`PropertiesPanel` — `renderForm` викликається на кожен render** — створює 12 різних JSX дерев
5. **`FlatList` в HomeScreen** — `renderStoryCard` створюється через `useCallback` але `StoryCard` використовує `withOpacity` на кожен render
6. **URI cache без TTL** — `uriCache` в asset-resolver.ts має LRU eviction (100 entries), але не має TTL для файлових URI

### 5.2 Що оптимізовано добре

- `StoryCard` обгорнутий в `React.memo`
- `animValueCache` в StoryReaderResponsive — кешування Animated.Value
- `useCallback` для основних handlers
- `useMemo` для обчислених значень
- `expo-image` з `cachePolicy="memory-disk"`

---

## 6. Підсумок знайдених проблем

### За пріоритетом

**КРИТИЧНІ (7):**
1. DocumentSceneEditor — scroll-to-bottom на кожен фокус/зміну (C33/C34)
2. No-op блоки (sound, camera, interactive_object) доступні в UI без попередження (C24)
3. God Component: DocumentSceneEditor 1394 LOC
4. God Component: StoryReaderResponsive 630 LOC, 30+ хуків
5. Hardcoded кольори в SceneComposer desktop layout (15+ hex)
6. `document.querySelector` без Platform guard в SceneComposer та DocumentSceneEditor
7. Canonical import без валідації URI та block data

**ВСОКІ (8):**
8. God Store: useAppStore 473 LOC, 18 полів, 15 actions
9. `useStoryState()` створює об'єкти на кожен render
10. `addStory` deprecated, але все ще використовується для demo stories
11. `reorderScenes` не змінює фактичний порядок
12. `executeStep` помилки тільки логуються, не показуються користувачу
13. `isTyping` розсинхронізація між executor і typewriter
14. `useFocusEffect` з `@react-navigation/native` замість `expo-router`
15. Demo story JSON без валідації (`as unknown as Story`)

**ПОМІРНІ (10):**
16. Unguarded console.log в tabs/index.tsx (DIAG logs)
17. Unguarded console.log в audio-player-service.ts
18. Unguarded console.log в API (lib/_core/api.ts)
19. CSP відсутній
20. `data: any` в story-validator.ts
21. `as unknown as` cast в api.ts:124, theme.ts:157
22. Phone layout SceneComposer — 5 табів на маленьких екранах
23. PropertiesPanel 1089 LOC — задовгий скрол
24. AssetPicker 491 LOC — всі категорії в одному файлі
25. `router.push() as never` anti-pattern

**НИЗЬКІ (5):**
26. `data:image/svg+xml` дозволений в asset-resolver (S-ME-1)
27. No Subresource Integrity для зовнішніх ресурсів
28. `Math.random()` fallback в id-utils.ts
29. `withOpacity` helper в tabs/index.tsx не обробляє всі hex формати
30. `StoryAutoSave` компонент повертає `null` — неочевидна поведінка

---

## 7. Архітектурні рекомендації

### 7.1 Декомпозиція God Components

**DocumentSceneEditor (1394 LOC) → розбити на:**
- `DocumentPage` — сторінка з блоками
- `DocumentBlock` — окремий блок (dialogue, narration, character)
- `DocumentCommandPalette` — `/` команда palette
- `DocumentToolbar` — верхня панель
- `useDocumentEditor` — hook з основною логікою
- `useDocumentKeyboard` — keyboard shortcuts

**StoryReaderResponsive (630 LOC) → розбити на:**
- `ReaderDisplay` — background + characters
- `ReaderDialogue` — dialogue box + typewriter
- `ReaderChoices` — choices (вже є як окремий компонент!)
- `ReaderControls` — top controls (вже є!)
- `ReaderTransitions` — fade/slide animations (вже є!)

**PropertiesPanel (1089 LOC) → розбити на:**
- `BlockPropertiesForm<T>` — generic form компонент
- `BackgroundProperties`, `CharacterProperties`, ... — окремі форми для кожного типу
- `BlockPropertyField` — перевикористовувані поля (AssetField, OptBtns, Toggle)

### 7.2 Store рефакторинг

**useAppStore → розбити на:**
- `useStoryStore` — storiesMetadata, sceneRecordsByStory, createStory, deleteStory
- `usePlaybackStore` — playbackState, saveSlots, saveGame, loadGame
- `useLibraryStore` — mediaLibrary, audioLibraries, characterLibraries
- `useSettingsStore` — settings, language (можливо об'єднати з theme-store)

### 7.3 Міграція з Legacy

- Видалити `addStory()` з useAppStore
- Замінити `as unknown as Story` на валідований import через `importStory()`
- Видалити deprecated типи (Story, StoryScene, Choice) після повної міграції
- Видалити `migrateFromLegacyKeys()` після підтвердження що всі користувачі мігрували

### 7.4 No-op блоки

**Варіант A (рекомендований):** Приховати непідтримувані блоки з BlockLibraryPanel, показавши badge "Coming Soon"

**Варіант B:** Додати UI-індикатор біля кожного no-op блоку в редакторі (badge "Not implemented")

**Варіант C (довгостроковий):** Реалізувати підтримку sound, camera, interactive_object

---

## 8. Загальна оцінка

| Категорія          | Оцінка | Коментар                                    |
|--------------------|--------|---------------------------------------------|
| Архітектура        | 7/10   | Чиста шарова структура, але God Components  |
| Типізація          | 8/10   | Добре типізовано, є `any` місця             |
| Безпека            | 8/10   | Основні вразливості закриті                |
| UX                 | 6/10   | Є критичні проблеми (scroll, no-op blocks)  |
| Продуктивність     | 7/10   | Є місця для оптимізації                    |
| Підтримуваність    | 6/10   | God Components ускладнюють розвиток         |
| Тестування         | ?/10   | Не аналізувалось (vitest не працює на NTFS) |
| **ЗАГАЛЬНА**       | **7/10**| **Солідний проект з чіткими напрямками покращення** |
