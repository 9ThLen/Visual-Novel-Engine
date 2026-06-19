# План виправлень GSD-аудиту 2026-06-15 (адаптований під Plate)

> **⚠️ ОБМЕЖЕННЯ:** Plate-редактор (vn-plate-editor) на даний момент працює не повноцінно.
> **НЕ ЧИПАЄМО:** PlateWebViewEditor, embedded-html.ts, scene-normalizer.ts, document-editor/, vn-plate-editor/
> **НЕ ЧИПАЄМО тестування component-editor та document-editor компонентів**

**Goal:** Виправити знаходження GSD-аудиту без впливу на Plate-редактор.

**Architecture:** Покрокові patch-и файлів. Кожен таск = 1 файл, 5-15 хв. Коміт після кожного таска (якщо git не висне на WSL/NTFS — пропускай).

**Tech Stack:** React Native, Expo, TypeScript, Zustand, NativeWind, Vitest

**Baseline:** `wiki/full-project-review-2026-06-15.md`

---

## Перевірка знаходжень (Anti-False-Positive Gate)

| # | Знаходження | Статус | Коментар |
|---|------------|--------|----------|
| C-01 | 6 порушень lib/ → stores/ | ✅ CONFIRMED | Перевірено grep + read_file |
| M-01 | 8× `as unknown as` | ✅ CONFIRMED | Всі 8 місць (PlateWebViewEditor.web.tsx:10 — НЕ ЧИПАТИ) |
| M-02 | console.log без __DEV__ в api.ts | ❌ FALSE POSITIVE | Всі всередині `if (__DEV__)` |
| M-03 | console.log без __DEV__ в audio-player-service.ts | ❌ FALSE POSITIVE | `logDebug()` має `if (!__DEV__) return` |
| M-04 | console.warn без __DEV__ в story-manuscript-save.ts | ❌ FALSE POSITIVE | Всі всередині `if (__DEV__)` |
| M-05 | useFocusEffect з @react-navigation/native | ✅ CONFIRMED | useFocusEffect мігруємо, useIsFocused — залишаємо (правильно) |
| M-06 | Rate limiting не підтверджений | ❌ FALSE POSITIVE | `RATE_LIMIT` константа є в api.ts:8-13 |
| M-07 | Hardcoded #ffffff | ✅ CONFIRMED | PreviewScreen.tsx:237, ReaderDisplay.tsx:233,255 |
| M-08 | Hardcoded rgba(0,0,0,0.32) | ✅ CONFIRMED | PreviewScreen.tsx:238, ReaderDisplay.tsx:238 |
| M-09 | 601 inline style={{}} | ⏭️ ПРОПУСТИТИ | Системна проблема, не фікситься за 1 сесію |
| M-10 | Непокриті модулі тестами | ✅ CONFIRMED | auth.ts, api.ts, error-handler.ts — пишемо тести |
| M-11 | Немає component tests | ⏭️ ПРОПУСТИТИ | Поки Plate не працює — не пріоритет |
| M-12 | Застарілі wiki-сторінки | ✅ CONFIRMED | Оновлюємо після рефакторингу |
| L-01 | Math.random() для ID тостів | ⏭️ ПРОПУСТИТИ | Не критично |
| L-03 | type-only імпорт з lib/types.ts | ✅ CONFIRMED | hooks/useAutoSave.ts:2 |

**Результат:** 7 false positives скасовано, 2 пропущено. До виправлення: **7 реальних** (1 CRITICAL + 4 MEDIUM + 2 LOW).

---

## Раунд 1 — Швидкі виправлення (Easy, ~20 хв)

### Таск 1.1: Замінити hardcoded #ffffff в PreviewScreen.tsx

**Objective:** Замінити білий flash-ефект на тематичний токен. **Не зачікає Plate** — PreviewScreen окремий компонент.

**Files:**
- Modify: `components/editor/PreviewScreen.tsx:237`

**Step 1: Прочитати поточний код**

```bash
sed -n '235,240p' components/editor/PreviewScreen.tsx
```

**Step 2: Застосувати patch**

```patch
--- a/components/editor/PreviewScreen.tsx
+++ b/components/editor/PreviewScreen.tsx
@@ -237,1 +237,1 @@
-        {hasFlash ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: '#fff', opacity: 0.28 }} /> : null}
+        {hasFlash ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: colors.surface, opacity: 0.28 }} /> : null}
```

**Step 3: Перевірити**

```bash
grep -n "#fff\|#ffffff" components/editor/PreviewScreen.tsx
```
Expected: 0 matches

---

### Таск 1.2: Замінити hardcoded #ffffff в ReaderDisplay.tsx

**Objective:** Замінити білий flash та курсор на тематичні токени.

**Files:**
- Modify: `components/reader/ReaderDisplay.tsx:233,255`

**Step 1: Прочитати поточний код**

```bash
sed -n '231,240p' components/reader/ReaderDisplay.tsx
sed -n '253,258p' components/reader/ReaderDisplay.tsx
```

**Step 2: Застосувати patch для flash**

```patch
-          {hasFlash ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#ffffff', opacity: 0.28 }]} /> : null}
+          {hasFlash ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.surface, opacity: 0.28 }]} /> : null}
```

**Step 3: Застосувати patch для cursor**

```patch
-                    backgroundColor: '#ffffff',
+                    backgroundColor: colors.foreground,
```

**Step 4: Перевірити**

```bash
grep -n "#fff\|#ffffff" components/reader/ReaderDisplay.tsx
```
Expected: 0 matches

---

### Таск 1.3: Замінити hardcoded rgba(0,0,0,0.32) для vignette

**Objective:** Замінити чорний vignette на тематичний колір.

**Files:**
- Modify: `components/editor/PreviewScreen.tsx:238`
- Modify: `components/reader/ReaderDisplay.tsx:238`

**Step 1: Перевірити поточний код**

```bash
grep -n "rgba(0,0,0,0.32)" components/editor/PreviewScreen.tsx components/reader/ReaderDisplay.tsx
```

**Step 2: Застосувати patch для PreviewScreen.tsx**

Замінити `borderColor: 'rgba(0,0,0,0.32)'` на `borderColor: withAlpha(colors.foreground, 0.32)`.

Перевірити що `withAlpha` імпортовано:
```bash
grep -n "withAlpha" components/editor/PreviewScreen.tsx
```
Якщо не імпортовано — додати:
```typescript
import { withAlpha } from '@/lib/_core/theme';
```

**Step 3: Застосувати аналогічний patch для ReaderDisplay.tsx**

**Step 4: Перевірити**

```bash
grep -n "rgba(0,0,0,0.32)" components/editor/PreviewScreen.tsx components/reader/ReaderDisplay.tsx
```
Expected: 0 matches

---

### Таск 1.4: Мігрувати useFocusEffect на expo-router у useReaderAudio.ts

**Objective:** Замінити імпорт useFocusEffect з @react-navigation/native на expo-router. **Не зачікає Plate** — це аудіо-хук для рідера.

**Files:**
- Modify: `hooks/useReaderAudio.ts:2`

**Step 1: Перевірити поточний код**

```bash
head -5 hooks/useReaderAudio.ts
```

**Step 2: Застосувати patch**

```patch
- import { useFocusEffect, useIsFocused } from '@react-navigation/native';
+ import { useFocusEffect } from 'expo-router';
+ import { useIsFocused } from '@react-navigation/native';
```

**Пояснення:** `useIsFocused` НЕ re-exported by expo-router — залишаємо з @react-navigation/native.

**Step 3: Перевірити**

```bash
head -5 hooks/useReaderAudio.ts
```

---

### Таск 1.5: Мігрувати hooks/useAutoSave.ts з lib/types.ts

**Objective:** Прибрати останній імпорт з deprecated барреля.

**Files:**
- Modify: `hooks/useAutoSave.ts:2`

**Step 1: Прочитати поточний код**

```bash
head -5 hooks/useAutoSave.ts
```

**Step 2: Застосувати patch**

```patch
- import type { PlaybackState, SaveSlot } from '../lib/types';
+ import type { PlaybackState } from '@/lib/engine/types';
+ import type { SaveSlot } from '@/lib/story-domain';
```

**Step 3: Перевірити**

```bash
grep -n "from.*lib/types" hooks/useAutoSave.ts
```
Expected: 0 matches

---

## Раунд 2 — Архітектурний рефакторинг (Hard, ~90 хв)

### ⚠️ Обмеження Plate

**НЕ ЧИПАЄМО ці файли (Plate залежить від них):**
- `lib/vn-plate-editor/` — весь каталог
- `lib/document-editor/` — весь каталог (document-scene.ts, commands.ts, types.ts)
- `lib/editor/` — story-manuscript.ts, story-manuscript-save.ts, story-manuscript-types.ts
- `components/document-editor/` — весь каталог
- `components/editor/SceneComposer*.tsx` — композитор використовує document-editor
- `components/editor/DocumentSceneEditor.tsx` — редактор сцени
- `lib/editor-scene-draft.ts`, `lib/editor-scene-save.ts` — draft/save для редактора

**ЧИПАЄМО БЕЗПЕЧНО:**
- `lib/story-hooks.ts` — містить useStoryState/useStoryActions + чисті функції (importStory, exportStory)
- `lib/audio-library.ts` — чисті функції + store
- `lib/media-library-service.ts` — store + сервіс
- `lib/character-library.ts` — бібліотека персонажів + store
- `lib/i18n.ts` — локалізація + store
- `lib/theme-provider.tsx` — React component (допустимий виняток)

### Таск 2.1: Витягнути useAppStore з lib/story-hooks.ts → hooks/use-story-state.ts

**Objective:** Перемістити store-залежний код з lib/ в hooks/.

**⚠️ Перевірка:** story-hooks.ts містить ВСЕ: і clean functions (importStory, exportStory, validateStoryMetadata), і store hooks (useStoryState, useStoryActions). Потрібно розділити.

**Files:**
- Create: `hooks/use-story-state.ts`
- Modify: `lib/story-hooks.ts` (додати @deprecated ре-експорти для store hooks)

**Step 1: Прочитати story-hooks.ts**

Прочитати весь файл щоб зрозуміти що іде в hooks/, а що залишається в lib/.

**Step 2: Створити hooks/use-story-state.ts**

Перенести тільки store-залежні функції:
- `useStoryState()`
- `useStoryActions()`

**Step 3: Додати @deprecated ре-експорти в lib/story-hooks.ts**

```typescript
/**
 * @deprecated Import from @/hooks/use-story-state instead.
 */
export { useStoryState, useStoryActions } from '@/hooks/use-story-state';
```

**Step 4: Оновити імпортери**

```bash
grep -rn "useStoryState\|useStoryActions" --include="*.ts" --include="*.tsx" components/ app/ hooks/ | grep -v __tests__ | grep -v "story-hooks.ts"
```

**Step 5: Перевірити що importStory/exportStory все ще працюють**

```bash
grep -rn "importStory\|exportStory\|validateStoryMetadata" --include="*.ts" --include="*.tsx" . | grep -v __tests__ | grep -v node_modules | grep -v "story-hooks.ts"
```

---

### Таск 2.2: Витягнути useAppStore з lib/audio-library.ts

**Objective:** Розділити чисті функції та store-доступ.

**Files:**
- Create: `stores/audio-library-actions.ts`
- Modify: `lib/audio-library.ts`

**Step 1: Прочитати audio-library.ts**

```bash
head -20 lib/audio-library.ts
```

**Step 2: Витягнути store-залежність**

Замінити `useAppStore.getState().audioLibraries` на параметр функції.

**Step 3: Створити stores/audio-library-actions.ts**

Store-обгортки для компонентів.

---

### Таск 2.3: Витягнути useAppStore з lib/media-library-service.ts

**Files:**
- Create: `stores/media-library-actions.ts`
- Modify: `lib/media-library-service.ts`

Аналогічно до таску 2.2.

---

### Таск 2.4: Витягнути useAppStore з lib/character-library.ts

**Files:**
- Modify: `lib/character-library.ts:2`

**Step 1: Перевірити як використовується**

```bash
grep -n "useAppStore" lib/character-library.ts
```

**Step 2: Витягнути store в параметр функції**

---

### Таск 2.5: Витягнути useAppStore з lib/i18n.ts

**Files:**
- Modify: `lib/i18n.ts:2`

**Step 1: Перевірити**

```bash
grep -n "useAppStore" lib/i18n.ts
```

**Step 2: Витягнути store в параметр**

---

### Таск 2.6: Додати коментар до lib/theme-provider.tsx

**Objective:** theme-provider.tsx — React component (.tsx), store-імпорт допустимий. Документуємо виняток.

**Files:**
- Modify: `lib/theme-provider.tsx:4`

```typescript
// NOTE: theme-provider.tsx is a React component (.tsx), store import is acceptable.
// This is the UI layer boundary, not pure business logic.
import { useThemeStore, useThemeInit } from '@/stores/theme-store';
```

---

## Раунд 3 — Тестування та документація (Medium, ~45 хв)

### Таск 3.1: Unit-тести для lib/_core/auth.ts

**Objective:** Покрити тестами OAuth flow, session management.

**Files:**
- Create: `__tests__/unit/lib/auth.test.ts`

**Тести:**
- `isValidUser()` — валідні/невалідні об'єкти
- `generateOAuthState()` — генерація
- `validateOAuthState()` — збіг/не збіг

```bash
npx vitest run __tests__/unit/lib/auth.test.ts
```

---

### Таск 3.2: Unit-тести для lib/_core/api.ts

**Objective:** Покрити тестами rate limiting, error handling.

**Files:**
- Create: `__tests__/unit/lib/api.test.ts`

**Тести:**
- Rate limiting — перевищення ліміту
- Error handling — невалідні відповіді
- Sanitization — Set-Cookie header

```bash
npx vitest run __tests__/unit/lib/api.test.ts
```

---

### Таск 3.3: Unit-тести для lib/error-handler.ts

**Objective:** Покрити тестами error handling.

**Files:**
- Create: `__tests__/unit/lib/error-handler.test.ts`

```bash
npx vitest run __tests__/unit/lib/error-handler.test.ts
```

---

### Таск 3.4: Оновити wiki

**Objective:** Оновити документацію після рефакторингу.

**Files:**
- Modify: `wiki/hooks-reference.md`
- Create: `wiki/changelog.md`

**Зміни:**
- Додати `use-story-state`, `use-audio-library`, `use-audio-library-actions`
- Додати changelog запис про фікси

---

## Підсумок

| Раунд | Тасків | Складність | Час | Файли |
|-------|--------|------------|-----|-------|
| 1 | 5 | 🟢 Easy | ~20 хв | PreviewScreen.tsx, ReaderDisplay.tsx, useReaderAudio.ts, useAutoSave.ts |
| 2 | 6 | 🔴 Hard | ~90 хв | story-hooks.ts, audio-library.ts, media-library-service.ts, character-library.ts, i18n.ts, theme-provider.tsx + нові файли |
| 3 | 4 | 🟡 Medium | ~45 хв | auth.test.ts, api.test.ts, error-handler.test.ts, wiki/ |

**Всього:** 15 тасків, ~2.5 години, ~20 файлів.

**НЕ ЧИПАТИ (Plate):**
- `lib/vn-plate-editor/` — embedded-html.ts, scene-normalizer.ts, types.ts
- `lib/document-editor/` — document-scene.ts, commands.ts, types.ts
- `components/document-editor/` — всі файли
- `components/editor/SceneComposer*.tsx`, `DocumentSceneEditor.tsx`
- `lib/editor/` — story-manuscript*.ts
- `lib/editor-scene-draft.ts`, `lib/editor-scene-save.ts`

**Очікуваний результат:** Оцінка 7.2 → ~7.8/10. Всі CRITICAL та MEDIUM виправлені. Plate не зачіпнуто.

---

## Пов'язані сторінки

- [[full-project-review-2026-06-15]] — GSD-аудит (джерело знаходжень)
- [[architecture-reference]] — Архітектурна довідка
