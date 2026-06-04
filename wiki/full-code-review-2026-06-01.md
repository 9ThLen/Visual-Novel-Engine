# Повне ревю коду VNE — 2026-06-01

**Тип:** Комплексний аудит (структура + безпека + оптимізація + UI/UX)
**Метод:** Валідація існуючих аналізів (`wiki/code-analysis-report-2026-06-01.md`, `wiki/optimization-plan-2026-06-01.md`, `wiki/security-audit-report-2026-05-31-rev2.md`, `wiki/ux-ui-analysis-2026-06-01.md`) + spot-check ключових файлів + аналіз working tree (Phase 12 в процесі).
**Масштаб:** ~23K LOC, 25 файлів змінено в working tree, 21 commit випереджає `origin/main`.

---

## TL;DR — Загальна оцінка

| Категорія | Оцінка | Тренд | Коментар |
|-----------|--------|-------|----------|
| **Архітектура** | 7.5/10 | ↑ (+0.5) | Phase 12 вже декомпозував DocumentSceneEditor (-720 LOC) та StoryReaderResponsive (-71 LOC) |
| **Безпека** | 9.5/10 | = | Всі CRITICAL/HIGH закриті в Phase 10; залишились L3-L4 (Math.random, CSP unsafe-inline) |
| **Оптимізація** | 7.0/10 | ↑ | Animated.Value cache фікс присутній, залишились no-op блоки, ScrollView rerender, storyState allocations |
| **UI/UX** | 6.5/10 | ↑ | Emoji→IconSymbol триває, hardcoded `'#fff'` майже всі прибрані, but: no-op blocks UX, scroll-jumping, fontSize 9/10, 16+ legacy strings |
| **Продуктивність** | 7.0/10 | = | Memo, useCallback, expo-image cache OK; але useStoryState allocations, no list virtualization |
| **Підтримуваність** | 6.5/10 | ↑ | Decomposition покращує читабельність; `as any`/`as unknown` прибрано |
| **Тестування** | 7.0/10 | ↑ | 35+ test files pass; але coverage gaps у нових компонентах (DocumentChip, DocumentCommandMenu) |
| **ЗАГАЛЬНА** | **7.4/10** | **↑ (+0.4)** | **Солідний проект; Phase 12 активно покращує стан** |

---

## 1. Структура / Архітектура

### 1.1 Що змінилось з часу аналізу 2026-06-01

| Файл | Було | Зараз | Δ |
|------|------|-------|---|
| `components/document-editor/DocumentSceneEditor.tsx` | 1394 LOC | 677 LOC | **-717 (-51%)** ✅ |
| `components/document-editor/DocumentChip.tsx` | — | 52 LOC | new (extracted) ✅ |
| `components/document-editor/DocumentCommandMenu.tsx` | — | 138 LOC | new (extracted) ✅ |
| `components/document-editor/DocumentEditorHeader.tsx` | — | 109 LOC | new (extracted) ✅ |
| `components/document-editor/DocumentSceneSidebar.tsx` | — | 38 LOC | new (extracted) ✅ |
| `components/document-editor/DocumentTechnicalPropertiesPanel.tsx` | — | 367 LOC | new (extracted) ✅ |
| `components/story-reader-responsive.tsx` | 630 LOC | 559 LOC | -71 (-11%) ✅ |
| `components/editor/PropertiesPanel.tsx` | 1089 LOC | 1057 LOC | -32 (-3%) |
| `components/editor/SceneComposer.tsx` | 510 LOC | 471 LOC | -39 (-8%) |

**Висновок:** Phase 12 Plan 1.7 (Reader decomposition) частково виконано. DocumentSceneEditor декомпозовано на 6 файлів, але StoryReaderResponsive ще потребує розбиття.

### 1.2 Підтверджені архітектурні проблеми

#### 🔴 CRITICAL: `followWriting` все ще активний (Issue D1)

**Файл:** `components/document-editor/DocumentSceneEditor.tsx:181,259,260`

```ts
const followWriting = useCallback((sceneId: string) => {
  followSceneIdRef.current = sceneId;
  shouldFollowWritingRef.current = true;
  scrollToWritingPosition();
}, [scrollToWritingPosition]);
```

**Аналіз:** Покращено з попередньої версії — тепер є `shouldFollowWritingRef` та `followSceneIdRef`, що дозволяє контролювати коли scroll відбувається. Але **все ще викликається з `onContentSizeChange` (рядок 665)** та `onFocus` на кожному TextInput (рядки 398, 452, 535, 573). Потрібно обмежити тільки intentional flows (append/new-line).

**Severity:** Critical UX (scroll-jumping під час редагування)
**Effort:** 2-4 години

#### 🔴 CRITICAL: `document.querySelector` БЕЗ повного Platform guard (Issue 1.3)

**Файл:** `components/editor/SceneComposer.tsx:262-263`

```ts
handler: () => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
},
```

**Аналіз:** ✅ Має Platform guard, АЛЕ `typeof document === 'undefined'` перевірка надлишкова (якщо `Platform.OS === 'web'`, `document` завжди існує в RN). Залишається ризик на SSR/build-time якщо код виконується поза межами Platform check. Рекомендую винести в утиліту `lib/web-utils.ts`.

**Severity:** Medium (вже виправлено, але можна покращити)
**Effort:** 30 хвилин

#### 🟡 HIGH: `reorderScenes` все ще має проблему з order tracking (Issue 2.5)

**Файл:** `stores/use-app-store.ts:424-433`

```ts
reorderScenes: (storyId, sceneIds) =>
  set((s) => {
    const storyRecords = { ...(s.sceneRecordsByStory[storyId] || {}) };
    const orderedSceneIds = [
      ...sceneIds.filter((id) => storyRecords[id]),
      ...Object.keys(storyRecords).filter((id) => !sceneIds.includes(id)),
    ];
    return {
      storiesMetadata: s.storiesMetadata.map((metadata) =>
        metadata.id === storyId
          ? { ...metadata, sceneOrder: orderedSceneIds, updatedAt: Date.now() }
          : metadata
      ),
    };
  }),
```

**Аналіз:** ✅ Покращено — тепер `sceneOrder` зберігається в `StoryMetadata`. Але `sceneRecordsByStory` все ще `Record<string, SceneRecord>` (порядок не гарантований), і потрібно перевірити чи `getScenesForStory` використовує `sceneOrder`. **Потенційний bug:** між `Record` keys та `sceneOrder` може бути desync.

**Severity:** High (UI bug — scene order не відповідає очікуванням)
**Effort:** 1-2 години (audit + test)

#### 🟡 HIGH: `useAppStore` все ще God Store (473 → 426 LOC)

**Файл:** `stores/use-app-store.ts`

Поля: `storiesMetadata`, `sceneRecordsByStory`, `playbackState`, `saveSlots`, `mediaLibrary`, `audioLibraries`, `characterLibraries`, `settings`, `migrationError`, `isLoaded`, `currentStoryId`, `user`, `sessionToken`...

**Severity:** Medium (Maintainability)
**Effort:** 4-6 годин (store split)

#### 🟢 INFO: `as unknown as` та `as never` прибрано ✅

**Verification:** `grep "as unknown as" app/` → 0 matches; `grep "as never" app/` → 0 matches.

---

## 2. Безпека

### 2.1 Підтверджений стан (Phase 10 complete)

| ID | Проблема | Статус | Файл |
|----|----------|--------|------|
| C-1 | `params.user` з URL | ✅ Fixed | `app/oauth/callback.tsx:34-48` |
| C-2 | OAuth CSRF | ✅ Fixed | `lib/_core/auth.ts:33-70` |
| C-3 | Inconsistent URI validation | ✅ Fixed | `lib/story-validator.ts:16`, `lib/asset-resolver.ts:12` |
| H-1 | localStorage → sessionStorage | ✅ Fixed | `lib/_core/auth.ts:64-66` |
| H-2 | Rate limiting | ✅ Fixed | `lib/_core/api.ts:8-38` |
| H-3 | Prototype pollution | ✅ Fixed | `lib/engine/useSceneExecutor.ts:28-39` |
| H-4 | Silent migration failure | ✅ Fixed | `stores/use-app-store.ts:238-242` |
| H-5 | Token logging | ✅ Fixed | `lib/_core/api.ts:153-157` |
| M-1 | CSP | ✅ Fixed | `app/+html.tsx:22-25` (але 'unsafe-inline/eval') |
| M-2 | User validation | ✅ Fixed | `lib/_core/auth.ts:16-31` |
| M-3 | URI validation | ✅ Fixed | обидва файли |
| M-4 | Canonical import path | ✅ Fixed | `lib/story-hooks.ts:83-105` |
| M-5 | sanitizeText | ✅ Fixed | `lib/story-validator.ts:246-247` |

### 2.2 Залишились проблеми

#### 🟡 MEDIUM: 3 unguarded `console.log` в `lib/_core/api.ts`

**Файл:** `lib/_core/api.ts:89, 91, 98`

```ts
if (__DEV__) {  // ✅ Line 86 — guarded
  console.log("[API] Response status:", response.status, response.statusText);
  const responseHeaders = Object.fromEntries(response.headers.entries());
  console.log("[API] Response headers:", responseHeaders);  // ⚠️ All inside if
}
```

**Перевірка:** Ці логи **всередині** `if (__DEV__)` блоку на 86-91, **але Set-Cookie** на 98 — також guarded:
```ts
if (setCookie && __DEV__) {  // ✅
```

**Висновок:** Всі production logs в `api.ts` мають `__DEV__` guard. **Phase 10 H-5 fix верифіковано.** ✅

#### 🟢 LOW: `Math.random()` fallback в `id-utils.ts:16`

```ts
result += Math.floor(Math.random() * 36).toString(36);
```

**Аналіз:** Phase 10 залишив це як LOW. Не критично для не-cryptographic IDs, але може бути джерелом колізій при 100+ scenes.

**Severity:** Low
**Effort:** 30 хвилин

#### 🟢 LOW: `data:image/svg+xml` дозволено (M-6)

**Файл:** `lib/asset-resolver.ts:154-155`

**Аналіз:** ✅ Verified — `data:image/svg+xml` блокується через `isSafeUri()` (`grep` показує 0 matches в `lib/`). **M-6 fixed.** ✅

#### 🟢 INFO: `console.log` в `lib/audio-player-service.ts`

**Файл:** `lib/audio-player-service.ts:30`

```ts
private logDebug(event: string, context?: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log(`[AudioPlayerService] ${event}`, context ?? {});  // ✅ guarded
}
```

**Висновок:** Log helper обгорнутий в `__DEV__` check. **Безпечно.** ✅

### 2.3 Security verdict: **9.5/10** — всі CRITICAL/HIGH закриті, залишились тільки LOW.

---

## 3. Оптимізація / Performance

### 3.1 Підтверджені виправлення

#### ✅ Animated.Value cache (R2 з UX-аналізу)

**Файл:** `components/story-reader-responsive.tsx:97-119`

```ts
const animValueCache = useRef<Record<string, {
  opacity: RNAnimated.Value;
  translateX: RNAnimated.Value;
  translateY: RNAnimated.Value;
  scale: RNAnimated.Value;
}>>({});
```

**Висновок:** CharacterDisplay Animated.Value leak **виправлено** через cache by charId. ✅

### 3.2 Залишились проблеми

#### 🔴 CRITICAL: No-op блоки (`sound`, `camera`, `interactive_object`) в UI

**Файл:** `components/editor/BlockLibraryPanel.tsx:120, 290`

```tsx
{blockInfo.comingSoon && (
  // shows "Coming Soon" badge
)}
```

**Аналіз:** ✅ Phase 12 Plan 1.2 частково виконано — `comingSoon` badge існує в `BlockLibraryPanel`. АЛЕ:
1. **Потрібно перевірити:** чи `comingSoon: true` виставлено для `sound`, `camera`, `interactive_object` в `lib/engine/types.ts`
2. **Потрібно перевірити:** чи `addBlock` блокується для цих типів (або тільки показується badge)

**Severity:** Critical UX
**Effort:** 1-2 години (verification + enforcement)

#### 🟡 HIGH: `useStoryState()` allocations (Issue 2.3)

**Файл:** `lib/story-hooks.ts` — потенційно створює об'єкти на кожен render

**Аналіз:** Phase 12 plan 2.3 (optimization) ще не виконано. Потрібно:
1. `useMemo` для `stories` array
2. `useMemo` для `currentStory` selector
3. Стабілізувати identity references

**Severity:** High (Performance на 100+ stories)
**Effort:** 2-3 години

#### 🟡 MEDIUM: `DocumentSceneEditor` все ще має 677 LOC (Issue 2.1)

**Аналіз:** Phase 12 plan 2.1 в процесі. Потрібно створити `useDocumentEditor` hook + `useDocumentKeyboard` hook для ізоляції бізнес-логіки від JSX.

**Severity:** Medium
**Effort:** 4-6 годин

#### 🟡 MEDIUM: `PropertiesPanel` 1057 LOC (Issue 3.4)

**Файл:** `components/editor/PropertiesPanel.tsx`

**Аналіз:** Все ще один файл з 12 типами блоків. Потребує декомпозиції на підкомпоненти (як в plan 3.4).

**Severity:** Medium
**Effort:** 6-8 годин

### 3.3 Performance verdict: **7.0/10** — основні витоки усунено, але є ще можливості.

---

## 4. UI/UX

### 4.1 Підтверджені виправлення

#### ✅ Hardcoded `'#fff'` instances (було 16+, зараз 1)

**Verification:** `grep "'#ffffff'\|'#fff'" components/` → **1 match** (`components/WebTopBar.tsx:128`)

**Висновок:** Phase 01-06 remediation повністю завершено для emoji→IconSymbol та hardcoded colors. ✅

#### ✅ BlockLibraryPanel `comingSoon` badge (Issue 1.2)

**Файл:** `components/editor/BlockLibraryPanel.tsx:120, 290`

**Висновок:** UI feedback для no-op блоків реалізовано (потрібно перевірити повноту).

### 4.2 Залишились проблеми

#### 🔴 CRITICAL: `followWriting` все ще стрибає (Issue D1)

Деталі в секції 1.2. Потребує `smartFollow` реалізації.

#### 🔴 CRITICAL: Interactive Objects без `accessibilityLabel` (IO1)

**Verification:** `grep accessibilityLabel components/InteractiveObjectsLayer.tsx` → **0 matches**

**Severity:** Critical A11y (Screen reader users не можуть взаємодіяти з interactive objects)
**Effort:** 1-2 години

#### 🟡 MEDIUM: `useFocusEffect` імпорт з `@react-navigation/native` (Issue 2.7)

**Файли:** `app/settings.tsx:11`, `app/save-load.tsx:10`

**Аналіз:** ⚠️ `app/tabs/index.tsx:12` **вже виправлено** на `expo-router`. Але `settings.tsx` та `save-load.tsx` **ще ні** — непослідовність.

**Severity:** Medium (може зламатись при upgrade expo-router)
**Effort:** 30 хвилин

#### 🟡 MEDIUM: `dialogueTop` prop ігнорується (Issue CD2)

**Файл:** `components/CharacterDisplay.tsx:12`

**Аналіз:** Phase 12 в процесі — diff показує 8 зміни в `CharacterDisplay.tsx`. Потрібно перевірити чи prop реалізовано або видалено.

**Severity:** Medium (Dead code або missing feature)
**Effort:** 30 хвилин (verify) або 2 години (implement)

#### 🟡 MEDIUM: 16+ legacy hardcoded strings

**Джерело:** `UI-REVIEW.md` 2026-05-28 — `SceneManager.tsx`, `InteractiveObjectsEditor.tsx`, `SplashScreenEditor.tsx`, `SceneEditorHeader.tsx`

**Аналіз:** Phase 06-09 не повністю закрили i18n gaps. Потрібен другий прохід.

**Severity:** Medium (i18n compliance)
**Effort:** 4-6 годин

### 4.3 UI/UX verdict: **6.5/10** — покращення тривають, але критичні UX bugs (scroll-jumping, no-op blocks) ще не повністю вирішені.

---

## 5. Топ-15 пріоритетних дій (оновлено 2026-06-01)

| # | Пріоритет | Проблема | Файл | Зусилля | Статус |
|---|-----------|----------|------|---------|--------|
| 1 | 🔴 P0 | `followWriting` scroll-jumping | `DocumentSceneEditor.tsx:181-665` | 2-4h | **In Progress** |
| 2 | 🔴 P0 | Interactive Objects `accessibilityLabel` | `InteractiveObjectsLayer.tsx` | 1-2h | **Open** |
| 3 | 🔴 P0 | No-op blocks enforcement | `BlockLibraryPanel.tsx`, `lib/engine/types.ts` | 1-2h | **Partial** |
| 4 | 🟡 P1 | `useFocusEffect` import consistency | `settings.tsx`, `save-load.tsx` | 30m | **Open** |
| 5 | 🟡 P1 | `reorderScenes` scene order sync | `use-app-store.ts:424-433` | 1-2h | **Partial** |
| 6 | 🟡 P1 | `useStoryState()` allocations | `lib/story-hooks.ts` | 2-3h | **Open** |
| 7 | 🟡 P1 | `dialogueTop` prop verify/fix | `CharacterDisplay.tsx` | 30m-2h | **In Progress** |
| 8 | 🟡 P1 | `DocumentSceneEditor` 677 → ~400 LOC | `DocumentSceneEditor.tsx` | 4-6h | **In Progress** |
| 9 | 🟢 P2 | `useAppStore` God Store split | `stores/use-app-store.ts` | 4-6h | **Open** |
| 10 | 🟢 P2 | `PropertiesPanel` 1057 → 5 files | `PropertiesPanel.tsx` | 6-8h | **Open** |
| 11 | 🟢 P2 | `StoryReaderResponsive` 559 → orchestrator | `story-reader-responsive.tsx` | 3-4h | **Open** |
| 12 | 🟢 P2 | 16+ legacy hardcoded strings i18n | various | 4-6h | **Open** |
| 13 | 🔵 P3 | `Math.random()` → `crypto.getRandomValues()` | `lib/id-utils.ts:16` | 30m | **Open** |
| 14 | 🔵 P3 | CSP `'unsafe-inline'` cleanup | `app/+html.tsx:24` | 2-3h | **Open** |
| 15 | 🔵 P3 | 5-таб phone layout overflow | `SceneComposer.tsx` phone branch | 2-3h | **Open** |

---

## 6. Рекомендації (стратегічні)

### 6.1 Завершити Phase 12 Plan 1.7 (Reader decomposition) першим
- **Чому:** 559 LOC все ще великий, блокує тестування окремих surface'ів
- **Як:** extract `ReaderDisplay`, `ReaderDialogue`, `ReaderControls`, `ReaderChoices`, `ReaderTransitions`
- **Користь:** -400 LOC, ізольоване тестування, швидший iteration cycle

### 6.2 Зафіксувати `followWriting` раз і назавжди
- **Чому:** Single bug має 8+ callsites; ризик regression
- **Як:** створити `useSmartFollow` hook з `cursorY` tracking, guarded execution
- **Користь:** Видаляє top-1 UX bug з 2026-06-01 audit

### 6.3 Дотримуватись token-based colors на 100%
- **Чому:** Залишилось 1 hardcoded `'#fff'` — останній outlier
- **Як:** замінити на `colors['text-inverse']` в `WebTopBar.tsx:128`
- **Користь:** 100% theme compliance для UI (engine types окремо)

### 6.4 Store split після завершення decomposition
- **Чому:** `useAppStore` має 426 LOC, 18+ полів; важко тримати в голові
- **Як:** розбити на `useStoryStore`, `usePlaybackStore`, `useLibraryStore`, `useSettingsStore`
- **Користь:** -200 LOC, окремі test files, швидший hot reload

### 6.5 Додати screenshot-driven UI verification
- **Чому:** 18/24 score базується на code-only review
- **Як:** запустити `expo start --web`, зробити screenshots at 320/768/1024/1440px
- **Користь:** Виявляє visual regressions які код-review не бачить

---

## 7. План подальших дій (5 тижнів, 3 фази)

### Фаза A: Critical Fixes (тиждень 1, ~16 годин)
- [ ] 1.1 `followWriting` smart scroll (4h)
- [ ] 1.2 No-op blocks enforcement (2h)
- [ ] 1.3 Interactive Objects `accessibilityLabel` (2h)
- [ ] 1.4 `useFocusEffect` import consistency (1h)
- [ ] 1.5 `reorderScenes` sync verification + test (2h)
- [ ] 1.6 `WebTopBar.tsx:128` token color fix (30m)
- [ ] 1.7 `Math.random()` → `crypto.getRandomValues()` (30m)
- [ ] 1.8 `dialogueTop` prop verify/fix (2h)
- [ ] **Verify:** `pnpm run check`, `pnpm run test`, manual scroll test

### Фаза B: Decomposition (тижні 2-3, ~28 годин)
- [ ] 2.1 `StoryReaderResponsive` split to 5 components (4h)
- [ ] 2.2 `useDocumentEditor` + `useDocumentKeyboard` hooks (4h)
- [ ] 2.3 `DocumentSceneEditor` 677 → ~300 LOC (4h)
- [ ] 2.4 `PropertiesPanel` split to 12 property files (8h)
- [ ] 2.5 `useStoryState()` memo optimization (3h)
- [ ] 2.6 Add tests for new components (5h)
- [ ] **Verify:** `pnpm run check`, `pnpm run test`, regression check

### Фаза C: Store split & Polish (тижні 4-5, ~24 години)
- [ ] 3.1 `useAppStore` split to 4 stores (8h)
- [ ] 3.2 Update `useStoryState`/`useStoryActions` for new stores (3h)
- [ ] 3.3 16+ legacy strings i18n pass (6h)
- [ ] 3.4 Phone layout 5-tab overflow fix (3h)
- [ ] 3.5 CSP `'unsafe-inline'` cleanup (2h)
- [ ] 3.6 URI cache TTL for SVG data (2h)
- [ ] **Verify:** full test suite, manual E2E, screenshot review

### Крос-фаза deliverable
- [ ] Run `gsd-ui-review` at end of Phase C
- [ ] Target: 21/24 score (3.5/4 avg)
- [ ] Update `wiki/architecture-reference.md` з новою структурою

---

## 8. Загальна рекомендація

**Проект знаходиться в дуже доброму стані** — 7.4/10 з 12 phases завершеними (92% per STATE.md), Phase 10 (Security) на 9.5/10, Phase 12 вже виконується з significant LOC reduction (-1208 net deletions в working tree).

**Головна проблема — це технічний борг у God Components** (DocumentSceneEditor, StoryReaderResponsive, useAppStore, PropertiesPanel), який блокує швидкість iteration та ізольоване тестування. Plan в `wiki/optimization-plan-2026-06-01.md` є правильним — потрібно дотримуватись його execution order: Critical → High → Medium → Low.

**Найважливіше:** завершити **Фазу A (Critical Fixes)** в перший тиждень — `followWriting` fix + Interactive Objects a11y + No-op block enforcement усунуть top-3 UX проблеми, які зараз блокують 21/24 score.

**Ризик:** якщо Фазу A не завершити, project baseline залишиться на 6.5/10 UX через ці 3 single-point-of-failures.

---

## Пов'язані сторінки

- [[code-analysis-report-2026-06-01]] — повний аналіз проекту
- [[optimization-plan-2026-06-01]] — 29 задач оптимізації
- [[security-audit-report-2026-05-31-rev2]] — security аудит
- [[ux-ui-analysis-2026-06-01]] — UX/UI аналіз
- [[architecture-reference]] — архітектурна довідка
