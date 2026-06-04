# VNE UX/UI Fixes — Розділення по складності

> **Source:** `docs/plans/2026-06-01-fix-ux-ui-critical-issues.md`

## Рівень складності

| Рівень | Опис | Характеристики |
|--------|------|----------------|
| 🟢 **Easy** | Типова заміна / видалення | 1-2 файли, шаблонна зміна, 0 ризик регресії |
| 🟡 **Medium** | Логічна зміна з залежностями | 2-4 файли, потрібен аналіз контексту, низький ризик |
| 🔴 **Hard** | Рефакторинг / нова логіка | 4+ файли, зміна поведінки, середній ризик |

---

## 🟢 Easy (8 задач) — ~1-1.5 год

> Можна робити паралельно або батчами по 2-3

| # | Задача | Файли | Що робити | Час |
|---|--------|-------|-----------|-----|
| E1 | **Прибрати `?? '#ffffff'` fallback** | 10+ файлів | Замінити `colors['text-inverse'] ?? '#ffffff'` на `colors['text-inverse']`. Шаблонна заміна через `sed` або `patch` | 15 хв |
| E2 | **Видалити мертвий `dialogueTop` prop** | 2 файли | Прибрати prop з Props interface, function signature, call site. Task 1.3 з плану | 10 хв |
| E3 | **StopReaderPlayback double-call** | 2 файли | Прибрати зайвий виклик в `useFocusEffect` body, залишити тільки cleanup. Task 2.8 | 10 хв |
| E4 | **`_isLastPage` → `awaitingChoice`** | 1 файл | Rename змінної + оновити всі використання. Task 2.7 | 5 хв |
| E5 | **Base64 fallback → conditional render** | 1 файл | Замінити inline base64 на `{spriteUri ? <Image /> : <View />}`. Task 2.12 | 10 хв |
| E6 | **Remove emoji з Settings headers** | 1 файл | Прибрати `🌐🔊✏️▶️ℹ️` з заголовків секцій. Task 2.10 | 5 хв |
| E7 | **Turbo skip interval 180→320ms** | 1 файл | Змінити число в `setInterval`. Task 2.4 | 2 хв |
| E8 | **Add "Choose option" hint** | 1 файл + i18n | Додати `{hasChoices && <Text>{t('chooseOption')}</Text>}`. Task 2.5 | 10 хв |

**Підсумок Easy:** 8 задач, ~67 хв чистого коду, мінімальний ризик

### Рекомендація для Easy:
Виконувати батчами по 3 задачі. Кожен батч = один commit.

```bash
# Batch 1: E1 + E4 + E4 (all text-inverse + rename + base64)
# Batch 2: E2 + E3 + E6 (dead code cleanup)
# Batch 3: E7 + E8 + E5 (UX polish)
```

---

## 🟡 Medium (8 задач) — ~3-4 год

> Кожна задача потребує аналізу контексту. Можна робити паралельно по 2.

| # | Задача | Файли | Що робити | Час | Залежності |
|---|--------|-------|-----------|-----|------------|
| M1 | **Replace hardcoded rgba → theme tokens** | 2 файли | Замінити 5 `rgba()` значень на `colors.*` токени. Task 2.1 | 25 хв | Після E1 (fallback cleanup) |
| M2 | **ReaderMenu responsive** | 1 файл | Додати `useWindowDimensions` + `Math.min(320, screenWidth - 32)`. Task 2.6 | 15 хв | Немає |
| M3 | **No-op blocks: console.warn + badge** | 2 файли | Прибрати `__DEV__` guard + додати "⚠ SOON" badge в BlockLibraryPanel. Task 1.4 | 30 хв | Немає |
| M4 | **Interactive objects a11y** | 1 файл + i18n | Додати `accessibilityLabel`, `accessibilityRole`, `accessibilityHint`. Task 2.2 | 20 хв | Немає |
| M5 | **Auto-play resume after choice** | 1 файл | Додати `executor.currentStepIndex` як deps до useEffect. Task 2.3 | 15 хв | Немає |
| M6 | **Reset to defaults у Settings** | 1 файл + 1 import + i18n | Додати Alert + `updateSettings(defaultUserSettings)`. Task 2.9 | 20 хв | Немає |
| M7 | **minHeight → paddingBottom у DocumentSceneEditor** | 1 файл | Знайти `minHeight`, замінити на `paddingBottom: 120` + divider line. Task 2.11 | 20 хв | Після H2 (followWriting) |
| M8 | **DocumentToolbar extraction** | 1 new + 1 modify | Винести toolbar з DocumentSceneEditor в окремий файл. Task 3.2 (частина) | 45 хв | Після H2 |

**Підсумок Medium:** 8 задач, ~3 год, потребують уважного тестування

### Рекомендація для Medium:
Паралельні пари: (M1 + M2), (M3 + M4), (M5 + M6), (M7 + M8)

---

## 🔴 Hard (4 задачі) — ~4-6 год

> Кожна задача потребує глибокого розуміння контексту. Виконувати послідовно.

| # | Задача | Файли | Що робити | Час | Залежності |
|---|--------|-------|-----------|-----|------------|
| H1 | **Animated.Value leak fix** | 1 файл | Додати `useRef` cache по `charId`, замінити inline `new Animated.Value()`. Task 1.2 | 45 хв | До E2 (dialogueTop removal) — обидва чіпляють character rendering |
| H2 | **`followWriting()` smart scroll** | 1 файл (1394 LOC) | Видалити aggressive scroll, додати cursor tracking через `onSelectionChange`, viewport-based scroll. Task 1.5 | 90 хв | Після M7 (minHeight) — обидві чіпляють скрол-логіку |
| H3 | **Decompose StoryReaderResponsive** | 1 → 6 файлів | Розбити 607 LOC на ReaderDisplay, ReaderControls, ReaderDialogue, ReaderChoices, ReaderTransitions. Task 3.1 | 120 хв | Після H1 (Animated fix) — рефакторинг character rendering |
| H4 | **PlayMode vs Reader documentation** | 2 файли | Додати header comments, документувати різницю. Task 3.3 | 15 хв | Немає |

**Підsummok Hard:** 4 задачі, ~4.5 год, висока потреба в code review

### Рекомендація для Hard:
Послідовно: H1 → H2 → H3. H4 можна будь-коли.

---

## Оптимальний порядок виконання

### Фаза 1: Quick Wins (Easy, батч 1) — ~30 хв
```
E1: text-inverse fallback removal (шаблонна заміна)
E4: _isLastPage → awaitingChoice (rename)  
E6: Remove emoji from Settings (cosmetic)
```
**Commit:** `fix: quick wins — text-inverse fallback, rename, cosmetic`

### Фаза 2: Dead Code Cleanup (Easy, батч 2) — ~25 хв
```
E2: dialogueTop removal
E3: stopReaderPlayback double-call
E5: Base64 fallback → conditional render
```
**Commit:** `fix: dead code cleanup — dialogueTop, double-call, base64`

### Фаза 3: UX Polish (Easy, батч 3) — ~20 хв
```
E7: Turbo skip interval
E8: "Choose option" hint
```
**Commit:** `fix: UX polish — turbo interval, choice hint`

### Фаза 4: Critical Bug Fix (Hard) — ~45 хв
```
H1: Animated.Value leak fix
```
**Commit:** `fix: cache Animated.Value per character ID`

### Фаза 5: Theme + a11y (Medium, паралель) — ~45 хв
```
M1: rgba → theme tokens
M2: ReaderMenu responsive
M3: No-op blocks warnings
M4: Interactive objects a11y
```
**Commit:** `fix: theme tokens, a11y, responsive menu, no-op warnings`

### Фаза 6: Feature Additions (Medium) — ~35 хв
```
M5: Auto-play resume
M6: Reset to defaults
```
**Commit:** `feat: auto-play resume, reset settings`

### Фаза 7: Editor Scroll Fix (Hard) — ~90 хв
```
H2: followWriting() smart scroll
M7: minHeight → paddingBottom (робити разом з H2 — обидві скрол)
```
**Commit:** `fix: smart scroll for document editor, remove minHeight`

### Фаза 8: Refactor (Hard + Medium) — ~165 хв
```
H3: Decompose StoryReaderResponsive
M8: Extract DocumentToolbar
H4: Document PlayMode vs Reader
```
**Commit:** `refactor: decompose StoryReaderResponsive (607→150LOC), extract DocumentToolbar`

---

## Підсумкова таблиця

| Фаза | Задачі | Час | Ризик | Паралельність |
|------|--------|-----|-------|---------------|
| 1 — Quick Wins | E1, E4, E6 | 30 хв | 🟢 None | Послідовно |
| 2 — Dead Code | E2, E3, E5 | 25 хв | 🟢 None | Послідовно |
| 3 — UX Polish | E7, E8 | 20 хв | 🟢 None | Паралельно |
| 4 — Animated Leak | H1 | 45 хв | 🟡 Low | Послідовно |
| 5 — Theme+a11y | M1-M4 | 45 хв | 🟡 Low | Паралельно (2+2) |
| 6 — Features | M5, M6 | 35 хв | 🟡 Low | Паралельно |
| 7 — Editor Scroll | H2, M7 | 90 хв | 🟡 Medium | Послідовно |
| 8 — Refactor | H3, M8, H4 | 165 хв | 🟡 Medium | Послідовно |
| **ВСЬОГО** | **20** | **~7.5 год** | | |

---

## Деталі по кожній задачі

### 🟢 E1: text-inverse fallback removal

**Складність:** Easy — шаблонна заміна в 10+ файлах

**Ризик:** 🟢 None — fallback ніколи не потрібен (token завжди є в palette)

**Замінити:**
```tsx
// Before (45 місць):
colors['text-inverse'] ?? '#ffffff'
colors['text-inverse'] ?? '#fff'

// After:
colors['text-inverse']
```

**Files:** Див. Task 1.1 у плані

**Verification:** `grep -rn "?? '#ffffff'\|?? '#fff'" --include='*.tsx' components/` → 0 results

---

### 🟢 E2: dialogueTop removal

**Складність:** Easy — видалення з 2 файлів

**Ризик:** 🟢 None — prop не використовується (мертвий код)

**Що робити:**
1. `CharacterDisplay.tsx` — прибрати `dialogueTop` з Props + function signature
2. `story-reader-responsive.tsx` — прибрати `dialogueTop={...}` з call site

**Verification:** `grep -rn "dialogueTop" --include='*.tsx' components/` → 0 results

---

### 🟢 E3: stopReaderPlayback double-call

**Складність:** Easy — видалення з 2 файлів

**Ризик:** 🟢 None — функція idempotent

**Files:** `app/save-load.tsx:89-96`, `app/settings.tsx:22-29`

---

### 🟢 E4: _isLastPage → awaitingChoice

**Складність:** Easy — rename змінної

**Ризик:** 🟢 None

**Files:** `components/story-reader-responsive.tsx:241,533`

---

### 🟢 E5: Base64 fallback removal

**Складність:** Easy — заміна inline base64 на conditional

**Ризик:** 🟢 None

**Files:** `components/CharacterDisplay.tsx:31`

---

### 🟢 E6: Remove emoji from Settings

**Складність:** Easy — cosmetic

**Ризик:** 🟢 None

**Files:** `app/settings.tsx:147,152,164,201,212`

---

### 🟢 E7: Turbo skip interval

**Складність:** Easy — зміна числа

**Ризик:** 🟢 None

**Files:** `components/story-reader-responsive.tsx:271` — `180` → `320`

---

### 🟢 E8: "Choose option" hint

**Складність:** Easy — додати 1 рядок + i18n

**Ризик:** 🟢 None

**Files:** `components/story-reader-responsive.tsx:533-535`

---

### 🟡 M1: rgba → theme tokens

**Складність:** Medium — потрібно зрозуміти семантику кожного кольору

**Ризик:** 🟡 Low — fallback кольори були неправильні для light theme

**Замінити:**
| Before | After |
|--------|-------|
| `?? 'rgba(15, 14, 23, 0.92)'` | `colors.dialogueBg` |
| `?? 'rgba(124,58,237,0.12)'` | `colors.choiceBg` |
| `'rgba(0,0,0,0.45)'` | `colors.backdrop` |
| `'rgba(255,255,255,0.18)'` | `colors['border-subtle'] ?? colors.border` |
| `'rgba(0, 0, 0, 0.6)'` | `colors.backdrop` |

**Files:** `components/story-reader-responsive.tsx:449,498,596,598`, `components/ReaderMenu.tsx:86`

---

### 🟡 M2: ReaderMenu responsive

**Складність:** Medium — додати useWindowDimensions

**Ризик:** 🟡 Low

**Files:** `components/ReaderMenu.tsx:89-103`

---

### 🟡 M3: No-op blocks warnings

**Складність:** Medium — дві зміни (executor + UI)

**Ризик:** 🟡 Low

**Що робити:**
1. `useSceneExecutor.ts` — прибрати `__DEV__` guard, залишити `console.warn`
2. `BlockLibraryPanel.tsx` — додати "⚠ SOON" badge для `sound`, `camera`, `interactive_object`

---

### 🟡 M4: Interactive objects a11y

**Складність:** Medium — додати accessibility props + i18n

**Ризик:** 🟢 None

**Files:** `components/InteractiveObjectsLayer.tsx:190-214`, `lib/translations/`

---

### 🟡 M5: Auto-play resume

**Складність:** Medium — додати dependency до useEffect

**Ризик:** 🟡 Low — може вплинути на auto-play timing

**Files:** `components/story-reader-responsive.tsx:243-253`

---

### 🟡 M6: Reset to defaults

**Складність:** Medium — додати Alert + button + i18n

**Ризик:** 🟢 None

**Files:** `app/settings.tsx`, `lib/translations/`

---

### 🟡 M7: minHeight → paddingBottom

**Складність:** Medium — потрібно знайти всі minHeight у 1394 LOC файлі

**Ризик:** 🟡 Low — впливає на layout

**Files:** `components/document-editor/DocumentSceneEditor.tsx`

---

### 🟡 M8: DocumentToolbar extraction

**Складність:** Medium — винести частину UI в окремий файл

**Ризик:** 🟡 Low

**Files:** `components/document-editor/DocumentSceneEditor.tsx` → `components/document-editor/DocumentToolbar.tsx`

---

### 🔴 H1: Animated.Value leak

**Складність:** Hard — потрібно зрозуміти lifecycle анімацій у React Native

**Ризик:** 🟡 Medium — зміна character rendering pipeline

**Що робити:**
1. Додати `useRef<Record<string, { opacity, translateX, translateY, scale }>>` cache
2. Замінити `new Animated.Value()` в `.map()` на `getCharAnimValues(charId)`
3. Перевірити що анімації коректно працюють при зміні сцени

**Files:** `components/story-reader-responsive.tsx:370-393`

---

### 🔴 H2: followWriting() smart scroll

**Складність:** Hard — потрібно реалізувати cursor tracking + viewport-based scroll

**Ризик:** 🟡 Medium — зміна UX редактора

**Що робити:**
1. Видалити `followWriting()` з `onFocus` та `onContentSizeChange`
2. Додати `cursorYRef` + `viewportHeightRef`
3. Додати `onSelectionChange` handler на TextInput
4. Реалізувати `smartFollow()` — скролити тільки коли cursor за межами viewport

**Files:** `components/document-editor/DocumentSceneEditor.tsx:740-763,837,981,1036`

---

### 🔴 H3: Decompose StoryReaderResponsive

**Складність:** Hard — рефакторинг 607 LOC God Component

**Ризик:** 🟡 Medium — потрібно зберегти всі побічні ефекти

**Files to create:**
- `components/reader/ReaderDisplay.tsx` — bg + characters
- `components/reader/ReaderControls.tsx` — auto-play, history, skip
- `components/reader/ReaderDialogue.tsx` — speaker + text + typewriter
- `components/reader/ReaderChoices.tsx` — choice list
- `components/reader/ReaderTransitions.tsx` — fade/slide animations

**Files to modify:**
- `components/story-reader-responsiveresponsive.tsx` → orchestrator (~150 LOC)

---

### 🔴 H4: PlayMode vs Reader documentation

**Складність:** Easy — додати коментарі

**Ризик:** 🟢 None

**Files:** `app/play.tsx`, `app/reader.tsx`

---

## Пов'язані сторінки

[[2026-06-01-fix-ux-ui-critical-issues|Повний план виправлень]]
[[ux-ui-analysis-2026-06-01|UX/UI Аудит — повний звіт]]
[[bug-patterns-vne|Баг-паттерни VNE]]
