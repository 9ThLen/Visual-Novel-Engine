# План оптимізації та виправлення багів VNE
# Створено: 2026-06-01
# Статус: НЕ ВИКОНУЄТЬСЯ (план очікує підтвердження)

## Зв'язані сторінки
[[code-analysis-report-2026-06-01|Повний аналіз проекту]]

---

## Етап 1: Критичні виправлення (Priority: CRITICAL)

### 1.1 Виправлення scroll jumping в DocumentEditor
**Проблема:** C33 — `followWriting()` викликається в `onFocus`, `onContentSizeChange`, init → viewport стрибає вниз
**Файл:** `components/document-editor/DocumentSceneEditor.tsx`

**Кроки:**
1. Видалити всі виклики `followWriting()` з `onFocus` handlers (~8 місць)
2. Видалити `followWriting()` з `onContentSizeChange`
3. Реалізувати `smartFollow(cursorY)`:
   - Додати `onSelectionChange` handler на кожен TextInput
   - Зберігати cursorY в `useRef{y: number, viewportH: number}`
   - Викликати scroll тільки коли `cursorY > viewportH - threshold`
4. Видалити `minHeight: pageMinHeight` (C34) — замінити на `paddingBottom: 120`
5. Замінити `marginBottom: 24` між сторінками на `1px` divider line

**Очікуваний результат:** Документ поводиться як Google Docs — плавний scroll без стрибків

---

### 1.2 No-op блоки — приховати або позначити
**Проблема:** C24 — `sound`, `camera`, `interactive_object` блоки доступні в UI але нічого не роблять
**Файли:** `components/editor/BlockLibraryPanel.tsx`, `components/editor/PropertiesPanel.tsx`, `lib/engine/useSceneExecutor.ts`

**Кроки (Варіант A — рекомендований):**
1. Додати `disabled: boolean` та `comingSoon: boolean` поля до `BlockTypeInfo`
2. Позначити `sound`, `camera`, `interactive_object` як `comingSoon: true`
3. В `BlockLibraryPanel` показувати badge "Coming Soon" для no-op блоків
4. Заборонити додавання no-op блків (або дозволити з візуальним індикатором)
5. Прибрати `console.warn` з useSceneExecutor для no-op блоків

**Очікуваний результат:** Користувач не витрачає час на непідтримувані блоки

---

### 1.3 Виправлення document.querySelector без Platform guard
**Проблема:** Crash на native при використанні `document.querySelector`
**Файли:**
- `components/editor/SceneComposer.tsx:262-263`
- `components/document-editor/DocumentSceneEditor.tsx` (всі `document.querySelector` виклики)

**Кроки:**
1. Обгорнути `document.querySelector('[data-search-input]')` в `if (Platform.OS === 'web')` guard
2. Зробити те саме для всіх `document.*` викликів в DocumentSceneEditor

**Очікуваний результат:** Crash на native при взаємодії з search input виправлено

---

### 1.4 Hardcoded кольори в SceneComposer desktop layout
**Проблема:** 15+ hardcoded hex кольорів в десконтій розмітці
**Файл:** `components/editor/SceneComposer.tsx` (рядок 404-499, phone/desktop)

**Кроки:**
1. Замінити `#f8f9fb` → `colors.surface` або `colors.background`
2. Замінити `#e3e6eb` → `colors.border`
3. Замінити `#252a32` → `colors.foreground`
4. Замінити `#ffffff` → `colors.background`
5. Замінити `#2667d9`, `#1e5fd0` → `colors.primary`
6. Замінити `#cbd8ef` → `colors['border-subtle']` (або додати токен)
7. Замінити `#eef4ff` → `colors['surface-container']` (або додати токен)
8. Замінити `#7b828d` → `colors.muted`
9. Замінити `#1f4f9f` → використовувати primary shade (або додати токен)

**Очікуваний результат:** Dark theme працює для desktop layout

---

### 1.5 Валідація canonical import
**Проблема:** Canonical JSON import не перевіряє URI safety та block data integrity
**Файл:** `lib/story-hooks.ts` (importStory функція)

**Кроки:**
1. Додати валідацію кожного TimelineStep при canonical import:
   - Перевірити `blockType` на допустимі значення
   - Перевірити `data` на відповідність типу blockType
   - Валідувати URI полів через `isSafeUri()`
2. Додати `try-catch` з user-friendly повідомленням
3. Пропускати невалідні кроки з warning замість abort всього import

**Очікуваний результат:** Невалідні дані не потрапляють у store

---

### 1.6 Валідація demo story JSON
**Проблема:** `demo-story.json` завантажується як `as unknown as Story` без валідації
**Файл:** `app/tabs/index.tsx`

**Кроки:**
1. Замінити `(demoStory as unknown) as Story` на валідований import:
   ```typescript
   const demo1 = StoryValidator.validateStory(demoStory);
   ```
2. Додати try-catch з fallback при помилці валідації
3. Зробити те саме для `demoStoryAdvanced`

**Очікуваний результат:** Пошкоджений demo JSON не crash app

---

### 1.7 Декомпозиція StoryReaderResponsive
**Проблема:** God Component 630 LOC, 30+ хуків
**Файл:** `components/story-reader-responsive.tsx`

**Цільова структура:**
```
StoryReaderResponsive (оркестратор, ~150 LOC)
  ├── ReaderDisplay (background + characters, ~80 LOC)
  ├── ReaderDialogue (speaker text + typewriter, ~120 LOC)
  ├── ReaderChoices (choices rendering, ~80 LOC)
  ├── ReaderControls (top controls, ~80 LOC)
  └── ReaderTransitions (overlay/dialogue transitions, ~50 LOC)
  useReaderState (hook з основною логікою, ~100 LOC)
```

**Кроки:**
1. Винести `ReaderControls` з `ControlButton` в окремий файл (частково вже є)
2. Винести `ReaderDisplay` (background image + characters rendering)
3. Винести `ReaderDialogue` (speaker nameplate + typewriter text + cursor)
4. Винести `ReaderChoices` (частково вже є як `components/reader/ReaderChoices.tsx`)
5. Створити `useReaderState` hook (поточний executor + handlers)
6. Зменшити основний компонент до оркестратора

---

## Етап 2: Високоприоритетні виправлення (Priority: HIGH)

### 2.1 Декомпозиція DocumentSceneEditor
**Проблема:** God Component 1394 LOC
**Файл:** `components/document-editor/DocumentSceneEditor.tsx`

**Цільова структура:**
```
DocumentSceneEditor (оркестратор, ~200 LOC)
  ├── DocumentToolbar (top bar, ~100 LOC)
  ├── DocumentPage (single page rendering, ~200 LOC)
  ├── DocumentBlock (individual block, ~150 LOC)
  ├── DocumentCommandPalette (command picker, ~150 LOC)
  └── DocumentSceneSettings (settings panel, ~150 LOC)
  useDocumentEditor (main logic hook, ~200 LOC)
  useDocumentKeyboard (keyboard shortcuts, ~100 LOC)
```

**Примітка:** Виконується ПІСЛЕ 1.1 (scroll fix), щоб не конфліктувати

---

### 2.2 Store рефакторинг — розбиття useAppStore
**Проблема:** God Store 473 LOC

**Кроки:**
1. Створити `stores/use-playback-store.ts` — playbackState, saveSlots, saveGame, loadGame
2. Створити `stores/use-library-store.ts` — mediaLibrary, audioLibraries, characterLibraries
3. Створити `stores/use-settings-store.ts` — settings, language (або обʼєднати з theme-store)
4. Залишити в `useAppStore` тільки: storiesMetadata, sceneRecordsByStory, CRUD операції
5. Оновити `useStoryState()` / `useStoryActions()` для використання нових stores
6. Оновити всі компоненти що імпортують з useAppStore

---

### 2.3 Оптимізація useStoryState()
**Проблема:** Створює об'єкти на кожен render
**Файл:** `lib/story-hooks.ts`

**Кроки:**
1. Замінити `buildCanonicalScene()` виклики на селектори що повертають посилання
2. Додати useMemo для `stories` array
3. Розглянути перенесення `currentStory` в окремий selector

---

### 2.4 Видалення deprecated коду
**Проблема:** `addStory()` deprecated але використовується
**Файли:** `stores/use-app-store.ts`, `lib/story-hooks.ts`, `app/tabs/index.tsx`

**Кроки:**
1. Замінити `addStory(demo1)` в tabs/index.tsx на `importStory()` використовуючи JSON.stringify
2. Позначити `@deprecated` методи як `private` або видалити
3. Перевірити всі виклики `addStory()` в кодовій базі — видалити/замінити

---

### 2.5 Виправлення reorderScenes
**Проблема:** Порядок не змінюється бо Record не гарантує порядок
**Файл:** `stores/use-app-store.ts:424-433`

**Кроки:**
1. Додати `sceneOrder: string[]` до `StoryMetadata`
2. Зберігати порядок окремо від `sceneRecordsByStory`
3. Оновити `reorderScenes` для зміни `sceneOrder`
4. Оновити `getScenesForStory` для сортування за `sceneOrder`

---

### 2.6 Виправлення isTyping race condition
**Проблема:** Executor isTyping vs typewriter isTyping розсинхронізовані
**Файли:** `lib/engine/useSceneExecutor.ts`, `components/story-reader-responsive.tsx`

**Кроки:**
1. Додати explicit state: `'idle' | 'typing' | 'waiting_for_input' | 'complete'`
2. Синхронізувати executor advance з typewriter complete
3. Додати `onTypewriterComplete` callback в `useTypewriter`

---

### 2.7 Виправлення useFocusEffect import
**Проблема:** Імпорт з `@react-navigation/native` замість `expo-router`
**Файл:** `app/tabs/index.tsx:13`

**Кроки:**
1. Замінити `import { useFocusEffect } from '@react-navigation/native'`
2. На `import { useFocusEffect } from 'expo-router'`
3. Протестувати що home screen коректно зупиняє audio при focus

---

## Етап 3: Помірні виправлення (Priority: MEDIUM)

### 3.1 Приховати unguarded console.log
**Файли:**
- `app/tabs/index.tsx:213,228,233` (DIAG logs)
- `lib/_core/api.ts` (API logs)
- `lib/audio-player-service.ts` (audio logs)

**Кроки:** Обгорнути або видалити всі `console.log/warn/error` що не в `if (__DEV__)`

---

### 3.2 CSP headers для web
**Файл:** `app/+html.tsx`

**Кроки:**
1. Додати `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; ...">``
2. Налаштувати політику для expo-web

---

### 3.3 Додати токени для hardcoded кольорів
**Файл:** `constants/theme-colors.json`

**Кроки:**
1. Додати `secondary`, `border-subtle`, `surface-container` до theme-colors.json
2. Використовувати їх замість hardcoded значень

---

### 3.4 Розбити PropertiesPanel на підкомпоненти
**Файл:** `components/editor/PropertiesPanel.tsx` (1089 LOC)

**Цільова структура:**
```
PropertiesPanel (оркестратор, ~100 LOC)
  ├── BlockPropertyForm<T> (generic form wrapper, ~80 LOC)
  ├── BackgroundProperties (~60 LOC)
  ├── CharacterProperties (~80 LOC)
  ├── TextProperties (~50 LOC)
  ├── DialogueProperties (~70 LOC)
  ├── ChoiceProperties (~60 LOC)
  ├── EffectProperties (~70 LOC)
  ├── MusicProperties (~60 LOC)
  ├── SoundProperties (~50 LOC)
  ├── CameraProperties (~60 LOC)
  ├── VariableProperties (~60 LOC)
  ├── TransitionProperties (~60 LOC)
  └── InteractiveObjectProperties (~80 LOC)
  BlockPropertyField (reusable fields: AssetField, OptBtns, Toggle, ~150 LOC)
```

---

### 3.5 Документувати no-op block types
**Файл:** `lib/engine/useSceneExecutor.ts`

**Кроки:** Замінити `console.warn` на user-visible indicator (toast/badge)

---

### 3.6 Оптимізація timelineKey в useSceneExecutor
**Проблема:** `JSON.stringify` на кожен render
**Файл:** `lib/engine/useSceneExecutor.ts:86-95`

**Кроки:**
1. Замінити на stable hash (наприклад, підрахунок кількості кроків + останній ID)
2. Або використовувати `useRef` з попереднім значенням для порівняння

---

### 3.7 Виправити as unknown as casts
**Файли:** `lib/_core/api.ts:124`, `lib/_core/theme.ts:157`

**Кроки:**
1. `api.ts:124` — замінити `text as unknown as T` на proper type guard
2. `theme.ts:157` — визначити `RuntimePalette` як explicit interface (не extending `SchemePaletteItem`)

---

### 3.8 Видалення router.push() as never
**Файли:** Всі `app/*.tsx` з `router.push(... as never)`

**Кроки:**
1. Визначити типизировані route helpers
2. Замінити `as never` на правильні типи

---

## Етап 4: Низькопріоритетні покращення (Priority: LOW)

### 4.1 Додати TTL для URI cache
**Файл:** `lib/asset-resolver.ts`

### 4.2 Поліпшити withOpacity helper
**Файл:** `app/tabs/index.tsx:37-46`
**Зробити:** Підтримка 3-char hex, 4-char hex (з alpha), 8-char hex

### 4.3 Видалити StoryAutoSave компонент що повертає null
**Файл:** `lib/story-hooks.ts:167-182`
**Зробити:** Перенести логіку в `_layout.tsx` або зробити явним HOC

### 4.4 Додати SRI для зовнішніх ресурсів
**Файл:** `app/+html.tsx`

### 4.5 Поліпшити phone layout SceneComposer
**Файл:** `components/editor/SceneComposer.tsx`
**Зробити:** Scrollable tabs або collapsible menu для 5 табів

### 4.6 Додати валідацію data: URI для SVG
**Файл:** `lib/asset-resolver.ts:156-170`
**Зробити:** Sanitize SVG content або блокувати `data:image/svg+xml`

### 4.7 Перевірити невикористані роути
**Файли:** `app/scene-editor.tsx`, `app/scene-manager.tsx`, `app/manuscript-editor.tsx`, `app/save-load.tsx`, `app/settings.tsx`
**Зробити:** Видалити або позначити як deprecated

---

## Порядок виконання

```
Етап 1 (CRITICAL) → Етап 2 (HIGH) → Етап 3 (MEDIUM) → Етап 4 (LOW)
     ↓                    ↓                  ↓                  ↓
  1.1 Scroll fix      2.1 DocEditor      3.1 Console       4.1 URI TTL
  1.2 No-op blocks    2.2 Store split    3.2 CSP           4.2 withOpacity
  1.3 querySelector   2.3 useStoryState  3.3 Theme tokens  4.3 StoryAutoSave
  1.4 Hardcoded       2.4 Deprecated     3.4 Properties    4.4 SRI
  1.5 Canonical       2.5 reorderScenes  3.5 No-op UI      4.5 Phone tabs
  1.6 Demo JSON       2.6 isTyping       3.6 timelineKey   4.6 SVG sanitize
  1.7 Reader decomp   2.7 useFocusEffect 3.7 as unknown    4.7 Dead routes
                      3.8 router.push
```

## Оцінка складності

| Етап | Завдань | Складність | Час (орієнтовно) |
|------|---------|------------|-------------------|
| 1    | 7       | 🔴 Висока  | 3-5 днів          |
| 2    | 7       | 🔴 Висока  | 4-6 днів          |
| 3    | 8       | 🟡 Середня | 2-3 дні           |
| 4    | 7       | 🟢 Низька  | 1-2 дні           |
| **ВСЬОГО** | **29** | | **10-16 днів** |

## Ризики

1. **Декомпозиція God Components** — найвищий ризик. Потрібно уважно розділити state management між підкомпонентами
2. **Store рефакторинг** — може зламати persistence. Потрібно тестувати міграцію
3. **Scroll fix** — може вплинути на інші частини DocumentSceneEditor. Потрібно регресійне тестування
4. **WSL/NTFS** — tsc та vitest можуть зависати. Тестування тільки через ручну перевірку

## Критерії завершення

- [ ] Всі CRITICAL виправлення змерджені
- [ ] `npx tsc --noEmit` проходить (або таймаут <120s на NTFS)
- [ ] Dark theme працює для всіх компонентів
- [ ] Document Editor не стрибає при фокусі
- [ ] No-op блоки приховані або позначені
- [ ] Немає unguarded console.log в production code
- [ ] Немає `document.querySelector` без Platform guard
