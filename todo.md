# TODO — Visual Novel Engine

*Оновлено: 2026-05-14*

---

## 🔴 Критично

- [x] **4.1 Повна XSS-санітація** — `sanitizeText()` видаляє script, svg, iframe, math, foreignObject, object, embed, event handlers, expression(), data:text/html (`lib/story-validator.ts`) ✅
- [x] **4.2 Path traversal у URI** — `validateUri()` блокує `../`, encoded traversal, null bytes + canonicalization через `decodeURIComponent()` (`lib/story-validator.ts`) ✅

## 🟠 Високий

- [x] **1.5 Об'єднати character-library** — hook імпортує CRUD з `lib/character-library.ts` замість дублювання ✅
- [x] **3.6 Конвертація scene-editor на Tailwind** — `app/scene-editor.tsx` — всі inline-стилі конвертовано ✅
- [x] **3.4 useFocusEffect для аудіо-клінапу** — замінено на `useEffect` з cleanup у `hooks/useReaderAudio.ts` ✅
- [x] **1.3 Об'єднати/розмежувати редактори** — `SceneEditorPanel.tsx` перероблено: 526→150 рядків, `StyleSheet`→Tailwind, використовує спільний `SceneEditorForm` ✅

## 🟡 Середній

- [x] **5.2 Тести для story-context.tsx** — 22 тести для `storyReducer` ✅
- [x] **5.2 Тести для useReaderAudio, useReaderInitialization** — 12 + 6 тестів з `renderHook` ✅
- [x] **5.3 Моки для expo-router, zustand, reanimated** — `__tests__/unit/__mocks__/` (zustand, jsdom) ✅
- [x] **5.1 Видалити порожню tests/ або перенести туди тести** — порожню `tests/` видалено ✅

## 🟢 Низький

- [x] **1.1/1.2 Документувати архітектуру** — STATE-MANAGEMENT-DECISION.md та SCENE-TYPES-DECISION.md оновлено з поточним станом ✅
- [x] **E2E тести для повного flow** — детальні коментарі в `__tests__/e2e/app.test.ts` ✅
- [x] **Accessibility labels** — додано до Button, StoryCard, Save/Load/Back/Delete кнопок в усіх головних екранах ✅

---

## ✅ Виконано

- [x] **1.4 Дублювання констант** — shared/const.ts видалено
- [x] **1.6 Зайвий save→load** — прибрано в save-load.tsx
- [x] **2.1 Race condition у useReaderInitialization** — виправлено
- [x] **2.2 BGM зупиняється/відновлюється** — виправлено
- [x] **2.3 useEffect без залежностей** — виправлено
- [x] **2.4 useCallback неповні залежності** — виправлено
- [x] **2.5 addBlockAfterPath bug** — виправлено
- [x] **3.1 any у useSceneEditorActions** — всі типи проставлені
- [x] **3.2 Незахищений console.error** — унікальний `console.error` у `lib/_core/api.ts:137` обгорнуто в `__DEV__`
- [x] **3.5 Зайвий useMemo** — `sceneListMemo` прибрано з `app/scene-editor.tsx`
- [x] **4.3 DEBUG=true хардкод** — замінено на `__DEV__`
- [x] **4.4 Hardcoded ключ інвентарю** — `'vne_inventory'` винесено у `STORAGE_KEYS.INVENTORY` в `lib/storage-keys.ts`
- [x] **EditTab deleted** — `components/scene-editor/EditTab.tsx` видалено
- [x] **Зубайд таймер у pagination.ts** — `setTimeout(100)` замінено на `await new Promise(resolve => setTimeout(resolve, 0))`
- [x] **Zustand mock** — додано `__tests__/unit/__mocks__/zustand/index.ts`
- [x] **Tailwind migration (all files)** — editor, save-load, tabs/index, scene-editor, SceneEditorPanel, BlockCard, BlockConfigPanel, story-reader-responsive ✅
- [x] **Editor unification** — SceneEditorPanel refactored to use SceneEditorForm ✅
- [x] **Tests for story-context** — 22 reducer tests ✅
- [x] **Tests for hooks** — 18 tests for useReaderAudio + useReaderInitialization ✅
- [x] **Accessibility labels** — added to Button + key screens ✅
- [x] **Critical path tests** — 375/375 тестів зелені ✅ (22 файли)
- [x] **State management decision documented** — STATE-MANAGEMENT-DECISION.md
- [x] **Scene types decision documented** — SCENE-TYPES-DECISION.md
