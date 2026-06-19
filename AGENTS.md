# AGENTS.md — Visual Novel Engine

## Правило: Використання Context7 для документації

**ОБОВ'ЯЗКОВО** використовуй Context7 MCP коли:

1. **Не знаєш API бібліотеки** — якщо не впевнений у тому, як працює конкретна функція, клас або метод
2. **Складний код** — коли стикаєшся зі складним кодом який ти не розумієш повністю
3. **Нова бібліотека** — коли працюєш з бібліотекою яку раніше не використовував
4. **Оновлення API** — коли підозряєш що API могло змінитися між версіями
5. **Приклади використання** — коли потрібні приклади використання конкретної функції
6. **Типи та інтерфейси** — коли потрібно дізнатися точні типи параметрів або значень, що повертаються

### Як використовувати

1. Спочатку виклич `resolve-library-id` з назвою бібліотеки
2. Потім виклич `query-docs` з отриманим ID та конкретним запитом

### Пріоритет

Context7 має **вищий пріоритет** ніж власні знання про API. Якщо ти не впевнений — завжди перевіряй через Context7.

---

## Інші правила

- **Don't fight with mistakes** — Коли стикаєшся з тією самою помилкою двічі, зупинись і досліджуй веб для 3-5 можливих виправлень, потім обери найефективніше.
- **Plate — єдина система редагування сцени** — Legacy Lego компоненти можуть лишатися тільки як reference або compatibility layer. Active editor screens не мають імпортувати `components/editor-legacy` або `stores/use-editor-store`.
- **Zustand напряму** — Не використовуй React Context для стейту. Використовуй useAppStore() напряму.
- **HomeScreen init:** `initializeApp()` має чекати `useAppStore.persist.onFinishHydration()` перед `loadStories()`, а `addStory` для демо має бути в `finally` (переживає помилки `loadStories`).
- **migrateFromLegacyKeys merge:** Не затирати вже згідратовані Persist дані пустими масивами — використовуй `stories.length > 0 ? stories : current.storiesMetadata`.
- **StoryAutoSave** не має викликати `migrateFromLegacyKeys()` — HomeScreen це робить.
- **`vars()` з nativewind** підтримується на Android — це не причина невидимих кольорів.
- **Pressable + `active:` = зламаний onPress:** NativeWind `active:` модифікатор на `Pressable` блокує `onPress`. Фікс: `remapProps(Pressable, { className: false })` + обгортання `Pressable` у `<View className="...">`.
- **Web storage:** Не використовуй `@react-native-async-storage/async-storage` напряму. Використовуй `createPersistentStorage()` з `lib/persistent-storage.ts` — на web падає на `localStorage`, на native — на AsyncStorage.
- **Web splash screen:** `SplashScreen.preventAutoHideAsync()` на модульному рівні вішає web. Викликай всередині `useEffect` через динамічний `import()`.
- **Reanimated на web:** Імпорт на рівні модуля (`import "react-native-reanimated"`) може впасти. Використовуй `try { require("react-native-reanimated") } catch {}`.
- **oklch() fallback:** Для старих браузерів додавай hex/rgb fallback-кольори перед oklch.
- **Dynamic import:** Не використовуй `await import()` для модулів, які вже імпортовані статично (напр. `useAppStore`).

-- 2026-05-25 Session learnings (Phase 6 complete) --
- **Phase 6 complete (3/3 plans):** Plans 06-01/02/03 all committed. Wave 1 = plans 01+02 (core executor + reader integration). Wave 2 = plan 03 (PreviewScreen integration + cleanup).
- **useSceneExecutor** at `lib/engine/useSceneExecutor.ts` — yields on text/dialogue/choice/transition, auto-executes the other 8. Takes `TimelineStep[]`, returns `{ sceneState, currentStepIndex, isComplete, isTyping, canAdvance, advance, selectChoice }`.
- **conditionUtils.ts** at `lib/engine/conditionUtils.ts` — pure `conditionsMet()` with 8 operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `has`, `not_has`). Tests existing.
- **sceneRecordToStoryScene** at `lib/scene-record-adapter.ts:181` — now `@deprecated`. Reader/PreviewScreen both use executor directly.
- **PreviewScreen rewrite pattern:** Replace `resolvePreviewTimeline` → `useSceneExecutor(timeline)`; replace `applyPreviewStepState` → executor's `sceneState`; music side effects via `useEffect` on `sceneState.musicTrackId` changes; typewriter local.
- **Executable cleanup pattern:** Keep unused functions with `@deprecated` JSDoc instead of removing — avoids breaking tests that import them.
- **3 no-op block types:** `sound`, `camera`, `interactive_object` have empty handlers in executor — deferred to future phases.

-- 2026-05-24 Session learnings --

- **Audio fade fix pattern:** `originalVolume` must be captured *before* any fade/stop/play operation modifies it. Save on `play()` call, use in `fadeOut`/`fadeIn` generation.
- **Variable block value type:** `operation === 'toggle'` → render `<Toggle>`; other ops → `<TextInput>` with `isNaN(Number(v)) ? v : Number(v)` parsing for numeric preservation.
- **RuntimePalette index signature:** Always add `[key: string]: string | undefined` to RuntimePalette type so dynamic bracket access (e.g. `colors['surface-2']`) works without `as any`.
- **BlockLibraryPanel is self-contained:** The panel manages its own search state internally. Do NOT pass `searchQuery`/`onSearchChange` props from parent — they are unused.
- **SceneComposer dual layout:** Phone uses tab-based view switching (`showBlockLibrary`/`showProperties`); desktop shows all three panels side-by-side. Both branches must be implemented in the component.

## Vitest Infrastructure (Session 2026-05-29)

### Done
- Removed `import { describe, expect, it, vi, ... } from 'vitest'` from all 41 test files (rely on `globals: true`) — fixes `require('vitest')` CJS rejection
- `format: 'cjs'` in esbuild config is incompatible with `vi.mock()` (esbuild hoists `require()` above `vi.mock()` calls, registering mock too late). Replaced with Vite aliases + `Module._resolveFilename` overrides.
- `__mocks__/` directory created for react-native, expo-*, @react-navigation/native, and project modules (stores, asset-resolver, audio-manager, audio-library)
- `vitest.config.ts` has Vite resolve aliases for all mocked modules
- `vitest.setup.ts` has `Module._resolveFilename` override that:
  - Maps alias specifiers to mock file paths for CJS `require()` output
  - Intercepts relative imports (`./`, `../`) that resolve to aliased project modules
  - Transpiles `.ts`/`.tsx` via TypeScript Compiler API
  - `mockExemptFiles` list prevents infinite loops + allows test files to use real implementations
- All previously-failing test files now pass (3/3 audio-player-service, 15/15 use-reader-audio)
- 35+ test files passing, 0 regressions

### Remaining (pre-existing, not caused by mocking)
- `__tests__/unit/lib/smoke.test.ts` (3 tests) — uses `await import()` which breaks with `format: 'cjs'`
- `__tests__/unit/lib/theme-runtime.test.ts` (3 tests) — same `await import()` issue
