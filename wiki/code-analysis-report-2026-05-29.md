# Code Analysis Report — 2026-05-29

Дата: 2026-05-29
Проект: Visual Novel Engine
Scope: Повний аудит всіх нових та змінених файлів

## Метрики

| Метрика | Значення |
|---------|----------|
| TS/TSX файлів (без tests/android/dist) | 182 |
| Загальний LOC | ~30,516 |
| `: any` / `as any` використань | 14 |
| Type assertions (`as unknown as`) | 9 |
| Незахищених `console.*` викликів | 5 |
| Zustand stores | 4 |

## Критичні (Critical)

### 1. No-op block types у scene executor
**Файл:** `lib/engine/useSceneExecutor.ts:158-173`
**Проблема:** Блоктипи `sound`, `camera`, `interactive_object` мають порожні `case` handlers — просто `break`. Це означає, що користувач додає блоки в едіторі, але вони нічого не роблять під час виконання. Якщо ці блоки доступні у UI — це критичний баг.
**Пріоритет:** Critical
**Дія:** Потрібно або реалізувати обробку, або приховати ці блоки з UI до моменту реалізації.

### 2. Demo story JSON не валідується — ЧАСТКОВО ВИРІШЕНО
**Файл:** `lib/runtime-story.ts:10`
**Статип:** Виправлено в runtime-story.ts (тепер `StoryValidator.validateStory(demoStory)`)
**Застереження:** Прибрано `as unknown as Story`. Однак якщо `demo-story.json` зміниться — validateStory кине exception при імпорті модуля, що краще ніж silent corruption. Для production розглянути graceful fallback.

### 3. `document.querySelector` без захисту
**Файл:** `components/editor/SceneComposer.tsx:263`
**Проблема:** `document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()` — працює лише на web. На native платформах `document` недоступний. Хоча `?.` запобігає crash, пошук поля вводу мовчки не спрацює на мобільних.
**Пріоритет:** High
**Дія:** Додати `Platform.OS === 'web'` перевірку або використовувати `ref`.

## Високий пріоритет (High)

### 4. Кольори SceneComposer'а не використовують theme tokens
**Файл:** `components/editor/SceneComposer.tsx:404-488`
**Проблема:** Desktop layout SceneComposer'а повністю захардкожений з hex-кольорами (`#f8f9fb`, `#e3e6eb`, `#252a32`, `#2667d9`, `#ffffff`). Це порушує дизайн-систему (всі кольори мають бути OKLCH з theme tokens). Темна тема не працюватиме для desktop layout.
**Пріоритет:** High
**Дія:** Замінисть всі hardcoded hex на `colors.*` токени з useColors().

### 5. `boxShadow` замість `elevation` в lego-editor
**Файли:** `components/lego-editor/AtomBlockComponent.tsx:50`, `LegoBlockLibrary.tsx:292`, `LegoCanvas.tsx:153`, `LegoFlowWorkspace.tsx:349-372`
**Проблема:** `boxShadow` не працює на Android. Має використовуватись `elevation` для Android і `boxShadow` для Web/iOS.
**Пріоритет:** High
**Дія:** Використовувати `Platform.select()` або `shadow-*` утиліту з NativeWind.

### 6. `Alert.alert` — React Native API в компонентах
**Файли:** `components/editor/SceneManager.tsx:126`, `StoryManuscriptScreen.tsx:110`, `InteractiveObjectsEditor.tsx:51`, `SplashScreenEditor.tsx:30`, `app/editor.tsx:51-93`, `app/save-load.tsx:105-133`
**Проблема:** `Alert.alert` блокує JS thread на момент показу. На iOS це непроблематично, але на Android може спричинити jank. Крім того, компоненти SceneManager, InteractiveObjectsEditor, SplashScreenEditor ймовірно не використовуються (legacy), тоді це dead code.
**Пріоритет:** Medium
**Дія:** Перевірити чи ці компоненти живі. Якщо so — замінити на кастомний модальний компонент.

### 7. `PropertiesPanel` використовує `as any`
**Файл:** `components/editor/PropertiesPanel.tsx:28-29`
**Проблема:** `const data = block.data as any` + `const upd = (field: string, value: any) => ...` — повна втрата типізації для properties panel, який обробляє всі 12 типів блоків.
**Пріоритет:** High
**Дія:** Типізувати `data` як `BlockData`  union type, зробити typed updater.

### 8. `block-validation.ts` весь на `any`
**Файл:** `lib/editor/block-validation.ts:1-63`
**Проблема:** Функції `isBlockComplete` та `getBlockEmptyFields` приймають `data: any` та `(e: any)`, `(o: any)`. Валідатор для 12 типів блоків без єдиної type guard.
**Пріоритет:** High
**Дія:** Використати `BlockData` union з `lib/engine/types.ts`, додати type narrowing per blockType.

## Середній пріоритет (Medium)

### 9. Дублювання `buildRuntimeStorySnapshot` / `buildStoryFromStateSnapshot` — ВИРІШЕНО
**Статус:** Виправлено
**Деталі:** `lib/story-state.ts` повністю видалено з кодової бази. 
`runtime-story.ts` тепер використовує `StoryValidator.validateStory(demoStory)` замість `as unknown as Story`.
Імпорти замінено в `story-hooks.ts` та тестах.

### 10. Незахищені `console.log` в production code
**Файли:** `lib/audio-player-service.ts:29`, `lib/_core/api.ts:52-60`
**Проблема:** 5 `console.*` викликів без `__DEV__` guard. В api.ts — логи з деталями запитів (токени, хедери), що є security risk.
**Пріоритет:** Medium
**Дія:** Обгорнути в `if (__DEV__)`.

### 11. Dual store — `scenesByStory` + `sceneRecordsByStory`
**Файл:** `stores/use-app-store.ts:74-75`
**Проблема:** Zustand store містить обидві колекції. Новий editor пише лише в `sceneRecordsByStory`, залишаючи `scenesByStory` stale. Це нормально як migration pattern, але має бути тимчасовим.
**Пріоритет:** Medium
**Дія:** Додати TODO з планом повного видалення `scenesByStory` після міграції.

### 12. SceneComposer — монолітний компонент (510 LOC)
**Файл:** `components/editor/SceneComposer.tsx`
**Проблема:** Один компонент обробляє phone layout (6 tabs + 3 panels), desktop layout (3 panels), shortcuts, modals, color styles, keyboard handlers. Важко підтримувати.
**Пріоритет:** Medium
**Дія:** Виділити DesktopComposer, PhoneComposer, та useSceneComposer hooks.

## Низький пріоритет (Low)

### 13. `as unknown as RuntimePalette` у theme
**Файл:** `lib/_core/theme.ts:157`
**Пріоритет:** Low (тимчасовий workaround, доки не зроблять всі токени обов'язковими у дизайн-системі)

### 14. `shadowColor` без `shadowOffset`/`shadowOpacity` на деяких платформах
**Файл:** `components/editor/SceneComposer.tsx:454`
**Пріоритет:** Low (працює на iOS, не працює на Android — вже відомо)

### 15. Lego editor може бути dead code
**Файли:** `components/lego-editor/*.tsx` (4 файли), `stores/use-lego-store.ts`
**Пріоритет:** Low
**Примітка:** Потрібно підтвердити чи використовується lego editor. Якщо ні — кандидат на видалення.

## Позитивні знахідки

- `canonical-scene.ts` — чиста архітектура з proper type narrowing
- `useSceneExecutor.ts` — добре типізований, має try-catch, правильний immutability pattern
- `story-hooks.ts` — правильно використовує Zustand selectors
- `scene-operations.ts` — immutable updates, правильний canonical pattern
- `conditionUtils.ts` — повне покриття operators, type-safe
- `type TimelineStep` в `conditionUtils.ts` правильно використовує extends з `engine/types.ts`

## Пов'язані сторінки

[[architecture-reference.md]]
[[block-types-reference.md]]
[[components-reference.md]]
[[stores-reference.md]]
[[migration-guide.md]]
