---
project: Visual Novel Engine
date: 2026-06-04
type: combined-audit (code + ui/ux)
auditors: gsd-code-reviewer, gsd-ui-auditor
files_audited: 187 source files
prior_audits:
  - audit-2026-06-02.md (7.0/10)
  - audit-2026-06-04.md (7.2/10)
  - UI-REVIEW.md (15/24, 2026-05-28)
phase_14_fixes_verified: true
regressions_found: 6
status: issues_found
---

# 🔍 Повний аудит Visual Novel Engine — 2026-06-04

**Обсяг:** 187 TS/TSX файлів (~25k LOC)
**Тип:** Combined deep audit (code review + UI/UX 6-pillar)
**Базова лінія:** audit-2026-06-04.md (4 дні тому), UI-REVIEW.md (7 днів тому)
**Висновок:** Прод-реліз потребує ~8-10 годин виправлень для усунення критичних знахідок

---

## 📊 Загальна оцінка: **6.8/10** ⬇️ (було 7.2/10)

| Пілор | Оцінка | Тренд | Коментар |
|-------|--------|-------|----------|
| Архітектура | 8/10 | → | Без змін |
| Безпека | 8/10 | → | Phase 14 fixes підтверджені, нового не знайдено |
| Якість коду | 6.5/10 | ⬇️ | 2 CRITICAL, 11 WARNING — регресії попереднього аудиту |
| UX/UI (6-pillar) | 13/24 (5.4/10) | ⬇️ (15/24) | Кольоровий пілор впав 2→1, Typography 3→2, Spacing 4→3 |
| DX | 7.5/10 | → | Без змін |
| Продуктивність | 7/10 | → | Без змін |

**Phase 14 (audit-hardening) верифікація:** ✅ Усі 5 публічних фіксив (CR-1, CR-2, CR-3, WR-1, WR-2, WR-3, WR-4, WR-5) — валі present and correct.

---

## 🚨 Критичні знахідки (4)

### CR-1: `useTypewriter` ігнорує зміну textSpeed mid-typing (РЕГРЕСІЯ WR-7)

**Файл:** `hooks/useTypewriter.ts:14-31`
**Підсистема:** Reader / Hooks
**Джерело:** Код-рев'ю

**Проблема:** `setInterval` callback захоплює `delay = charDelayMs(textSpeed)` ОДИН раз при `startTypewriter()`. Коли користувач змінює швидкість тексту під час друку, `textSpeed` оновлюється в dependency array, створюється новий callback, але **працюючий interval все ще використовує старе `delay` значення з його closure**. Нова швидкість набуває чинності лише на наступному `startTypewriter()` (тобто на наступній сцені/лінії).

**User impact:** Зміна text speed під час лінії не працює до наступної лінії — порушує контракт фічі.

**Phase 14 status:** Task 5 (WR-7) у `14-PLAN.md` — НЕ ВИКОНАНО. Git log не містить коміту.

**Fix:**
```typescript
// hooks/useTypewriter.ts — використати ref для live-передачі textSpeed
const textSpeedRef = useRef(textSpeed);
useEffect(() => { textSpeedRef.current = textSpeed; }, [textSpeed]);

// В середині interval tick:
const delay = charDelayMs(textSpeedRef.current); // свіже значення кожен тік
```

**Effort:** S (1h)

---

### CR-2: 8+ нових hex-alpha concat сайтів у `document-editor/` і `manuscript/`

**Файли (10 сайтів):**

| Файл | Рядок | Pattern |
|------|-------|---------|
| `components/document-editor/DocumentSceneSidebar.tsx` | 30 | `` `${colors.primary}12` `` |
| `components/document-editor/DocumentBlockDialogue.tsx` | 97 | `` `${colors.primary}14` `` |
| `components/document-editor/DocumentBlockDialogue.tsx` | 98 | `` `${colors.primary}55` `` |
| `components/document-editor/DocumentCommandMenu.tsx` | 104 | `` `${toneColor}16` `` |
| `components/document-editor/DocumentChip.tsx` | 35 | `` `${toneColor}40` `` |
| `components/document-editor/DocumentChip.tsx` | 36 | `` `${toneColor}12` `` |
| `components/editor/manuscript/StoryManuscriptBlock.tsx` | 303 | `` `${colors.primary}14` `` |
| `components/editor/manuscript/StoryManuscriptSidebar.tsx` | 57 | `` `${colors.primary}18` `` |
| `components/editor/PreviewScreen.tsx` | 303 | `` `${colors.primary}14` `` (WR-1 регресія) |
| `components/editor/TimelinePanel.tsx` | 169 | `shadowColor: '#000'` |

**Джерело:** Код-рев'ю (CR-2) + UI-рев'ю (CRITICAL P3 × 6)

**Проблема:** `lib/_core/theme.ts` має `withAlpha(hex, alpha)` helper (Phase 14, WR-4). AGENTS.md правило: *"`withAlpha` over hex concat"*. Усі 8 сайтів передували helper'у, але не були відремонтовані. WR-4 sweep у Phase 14 пропустив `document-editor/` subtree.

**Чому CRITICAL:** Hex+alpha string-concat дає семантично неправильний alpha для OKLCH кольорів (sRGB rounding потім alpha у display-p3). Насичені accent кольори виглядають "брудними". `withAlpha()` конвертує у display-p3, застосовує alpha у ширшому gamut, конвертує назад.

**Fix:**
```typescript
// Перед
backgroundColor: `${colors.primary}14`
// Після
import { withAlpha } from '@/lib/_core/theme';
backgroundColor: withAlpha(colors.primary, 0.08)
```

**Effort:** XS (1-line each, ~10 min total)

---

### CR-3: Hardcoded `'#000000'` / `'#ffffff'` у `story-reader-platform.ts`

**Файл:** `lib/story-reader-platform.ts:7, 17`
**Підсистема:** Reader / Platform layer
**Джерело:** UI-рев'ю (CRITICAL P3)

**Проблема:** `WEB_TEXT_COLOR_FALLBACK = '#000000'` і `WEB_BG_COLOR_FALLBACK = '#ffffff'` — захардкоджені fallback-кольори для native modules, які не отримують `colors` object. На Android/iOS reader де `useColors()` може бути не готовий, platform layer інжектує фіксований чорний/білий, що конфліктує з OKLCH токенами.

**Fix:**
```typescript
// Замінити fallback на null/transparent; споживачі повинні передавати colors явно
export const WEB_TEXT_COLOR_FALLBACK: string | null = null;
export const WEB_BG_COLOR_FALLBACK: string | null = null;
```

**Effort:** S (30 min)

---

### CR-4: Unicode glyphs (▲▼←→✓) як primary controls (P0 порушення)

**Файли (6 сайтів):**

| Файл | Рядок | Glyph | Призначення |
|------|-------|-------|-------------|
| `components/editor/SplashScreenEditor.tsx` | 122 | ▲▼ | Expand/collapse |
| `components/editor/SplashScreenEditor.tsx` | 372 | ✓ | Checkbox |
| `components/InteractiveObjectsEditor.tsx` | 124 | ▲▼ | Expand/collapse |
| `components/editor/PreviewScreen.tsx` | 280 | ← | Back button |
| `components/editor/SceneSelector.tsx` | 390 | → | Connector |
| `components/editor/SceneSelector.tsx` | 518 | ▼ | Input marker |
| `components/editor/SceneComposerPhone.tsx` | 191 | (rotate hack) | Fake back arrow |

**Джерело:** UI-рев'ю (CRITICAL P2 × 5+)

**Проблема:** UI-SPEC §P0 забороняє emoji/glyphs як primary command/nav. `IconSymbol` MAPPING відсутній: `chevron.up`, `chevron.down`, `arrow.left`, `arrow.right`, `xmark`, `checkmark`, `plus.circle`, `minus`. SceneComposerPhone обертає `chevron.right` на 180° щоб підробити back arrow.

**Fix:**
1. Розширити `MAPPING` у `components/ui/icon-symbol.tsx`:
   ```typescript
   chevron.up: 'chevron.up',
   chevron.down: 'chevron.down',
   arrow.left: 'arrow.left',
   arrow.right: 'arrow.right',
   xmark: 'xmark',
   checkmark: 'checkmark', // уникати колізії з 'check'
   ```
2. Замінити glyphs у 6 файлах

**Effort:** S (1.5h)

---

## 🔴 Додаткові критичні (3)

### CR-5: 21 hardcoded English a11y/string у 10 файлах (i18n P0)

**Файли:** `app/preview.tsx:18,26`, `SplashScreenEditor.tsx:387`, `MiniPreview.tsx:170`, `story-reader-responsive.tsx:270`, `ReaderControls.tsx:89,96,119`, `panel-chrome.tsx:55,91,105`, `asset-field.tsx:36,39`, `DocumentBlockChoice.tsx:66,67,93,94`, `DocumentBlockDialogue.tsx:110,136`, `DocumentPage.tsx:138,219,270`

**Fix:** Додати translation keys (EN/UK/PL) + замінити на `t()`. Деякі ключі вже існують (`document.invalidRoute`).

**Effort:** M (3h)

---

### CR-6: `app/preview.tsx` dead-end error state

**Файл:** `app/preview.tsx:18, 26`
**Джерело:** UI-рев'ю (WARNING P6)

**Проблема:**
- `<Text>Loading...</Text>` без spinner, без i18n
- `<Text>No story or scene ID provided</Text>` без error toast, без recovery action — dead-end

**Fix:**
```tsx
// Замість
<Text>Loading...</Text>
<Text>No story or scene ID provided</Text>

// Використати
<ActivityIndicator size="large" />
<Text>{t('common.loading')}</Text>

<Text>{t('document.invalidRoute')}</Text>
<Button onPress={() => router.back()}>{t('common.back')}</Button>
```

**Effort:** XS (15 min)

---

### CR-7: `story-manuscript-save.ts` — production dedup silently dropped

**Файл:** `lib/editor/story-manuscript-save.ts:75-89`
**Джерело:** Код-рев'ю (WR-4)

**Проблема:** `if (__DEV__)` блок містить business logic, не тільки debug warning:
```typescript
if (__DEV__) {
  // ... warning code ...
  if (seenSourceStepIds.has(sourceStepId)) {
    return /* skip duplicate */;
  }
  seenSourceStepIds.add(sourceStepId);
}
```
`seenSourceStepIds.add()` запускається **всередині** `if (__DEV__)` блоку. У production builds дедуплікація **не відбувається**. Користувач, який редагує той самий step двічі, отримає дублікати manuscript entries у release builds.

**Fix:** Винести dedup логіку з `__DEV__` блоку, warning залишити в `__DEV__`:
```typescript
// Завжди dedup
if (seenSourceStepIds.has(sourceStepId)) {
  return;
}
seenSourceStepIds.add(sourceStepId);

// Тільки warn у dev
if (__DEV__) {
  console.warn(/* ... */);
}
```

**Effort:** XS (5 min)

---

## 🟡 Попередження (17)

### Код-рев'ю (11)

| ID | Файл | Опис | Effort |
|----|------|------|--------|
| WR-1 | `components/editor/PreviewScreen.tsx:41` | `useRef(new AudioPlayerService())` per-mount service instantiation (U-2 регресія) | S |
| WR-2 | `app/tabs/index.tsx:156,164,191` | Unguarded `console.*` calls (P-2 регресія) | XS |
| WR-3 | `lib/translations.ts:1,980` | `Language` type missing `'pl'` (UX-4 регресія) | S-S |
| WR-5 | `lib/engine/useSceneExecutor.ts:284-318` | `selectChoice` не auto-advance on `targetSceneId`, не задокументовано | S |
| WR-6 | `components/document-editor/DocumentSceneEditor.tsx:94-101` | Render-time `setState` (React anti-pattern) | S |
| WR-7 | `lib/engine/conditionUtils.ts:5-10` | `toComparable` робить роботу для кожного оператора (waste) | XS |
| WR-8 | `lib/engine/conditionUtils.ts:38` | `isEmpty` не враховує порожні масиви (inconsistency) | XS |
| WR-9 | `lib/story-hooks.ts:372` | `loadStories` selector повертає `migrateFromLegacyKeys` (misleading name) | XS |
| WR-10 | `lib/_core/auth.ts:24-30` | `isValidUser` type guard з недосяжним `return false` (defensive code) | XS |
| WR-11 | `lib/persistent-storage.ts:18-26` | `createPersistentStorage` silent noop on web SSR без warning | XS |

### UI-рев'ю (10)

| ID | Файл | Опис | Effort |
|----|------|------|--------|
| UI-W1 | `components/document-editor/DocumentPage.tsx:136` | `fontSize: 36` off-scale (max typeScale: 32) | S |
| UI-W2 | `components/document-editor/DocumentEditorHeader.tsx:66,70,85` | Inline `fontSize: 20/14/11/16` bypass `typeScale` | S |
| UI-W3 | `components/document-editor/DocumentSceneSidebar.tsx:20,35,36` | Inline `fontSize: 11/14/12` bypass `typeScale` | S |
| UI-W4 | `components/document-editor/DocumentTechnicalPropertiesPanel.tsx:50,365,366` | Inline `fontSize: 14/11/18` bypass `typeScale` | S |
| UI-W5 | `components/document-editor/DocumentSceneSidebar.tsx:19,21,27,32,33,36` | Magic spacing (14, 10) off scale | S |
| UI-W6 | `components/document-editor/DocumentPage.tsx:108,120,121,122,213,226,266` | Magic spacing (10, 42, 1) | S |
| UI-W7 | `components/document-editor/DocumentEditorHeader.tsx:40-49` | Magic spacing (76, 18, 14) | S |
| UI-W8 | `components/document-editor/DocumentTechnicalPropertiesPanel.tsx:47,48,49,363,365,366` | Magic spacing (11, 9, 10, 14) | S |
| UI-W9 | `components/editor/SceneComposerPhone.tsx:209,247` | Дублікат `t('editor.blocks')` (screen-reader announces twice) | XS |
| UI-W10 | `components/SplashScreenEditor.tsx` | Немає undo path для preset | S |

---

## ℹ️ Інформаційні (10)

### Код-рев'ю (7)
- `lib/scene-operations.ts` має 3 TODO коментарі (tech debt tracking)
- `PropertiesPanel` decomposition — ПОЗИТИВНИЙ ПАТЕРН для майбутніх рефакторів
- `charDelayMs` candidate for promotion to tested util
- `app/play.tsx` — exemplary router trampoline
- `ErrorBoundary` + `error-handler` — well-structured
- 8 prod `as any` / 26 test `as any` — healthy count, all justified
- ESLint disable comments — all valid

### UI-рев'ю (3)
- `lib/engine/types.ts:70-81` — 12 hex block-category colors (document or migrate)
- `lib/translations.ts` — 2-locale vs 3-locale spec drift
- `IconSymbol` MAPPING gap (root cause of Unicode glyph issues) — covered by CR-4

---

## 🔄 Regression Matrix (vs. попередні аудити)

### ✅ Phase 14 ФІКСИ верифіковані

| ID | Опис | Статус |
|----|------|--------|
| CR-1 (Phase 14) | OAuth callback no longer logs `access_token` | ✅ VERIFIED |
| CR-2 (Phase 14) | `api.ts` no longer logs token prefix | ✅ VERIFIED |
| CR-3 (Phase 14) | `SceneComposer` `setTimeout` cleanup on unmount | ✅ VERIFIED |
| WR-1 (Phase 14) | `DocumentSceneEditor` `setTimeout` cleanup | ✅ VERIFIED |
| WR-2 (Phase 14) | `PropertiesPanel` 1094→97 LOC decomposition | ✅ VERIFIED |
| WR-3 (Phase 14) | `useReaderAudio` uses module-level singleton | ✅ VERIFIED |
| WR-4 (Phase 14) | `withAlpha` helper added to `lib/_core/theme.ts` | ✅ VERIFIED |

### ❌ Попередні знахідки НЕ ВИКОНАНІ

| ID | Опис | Звідки | Стало |
|----|------|--------|------|
| WR-7 (audit-06-04) | `useTypewriter` textSpeed re-read | Phase 14 Task 5 | **CR-1** (цей аудит) |
| U-2 (audit-06-04) | `PreviewScreen` useRef(new AudioPlayerService) | Phase 14 skip | **WR-1** (цей аудит) |
| P-2 (audit-06-02) | `app/tabs/index.tsx` console.* guards | Phase 14 skip | **WR-2** (цей аудит) |
| UX-4 (audit-06-04) | `Language` type add `'pl'` | Phase 14 skip | **WR-3** (цей аудит) |
| UX-1 (audit-06-04) | `manuscript.dialogue` translation key missing | **✅ ВИПРАВЛЕНО** (EN/UK present) | - |
| UX-1 (audit-06-04) | Hardcoded English у SplashScreenEditor | Phase 14 skip | **CR-5** (цей аудит) |
| UX-3 (audit-06-04) | Hex+alpha у manuscript | Phase 14 skip | **CR-2** (цей аудит) |
| UX-4 (audit-06-04) | Inline fontSize у document-editor | Phase 14 skip | **UI-W1..W4** (цей аудит) |
| UX-5 (audit-06-04) | Unicode glyphs у InteractiveObjectsEditor | Phase 14 skip | **CR-4** (цей аудит) |
| UX-6 (audit-06-04) | Hardcoded `Loading...` у MiniPreview | Phase 14 skip | **CR-5** (цей аудит) |

### ⚠️ Нові знахідки

| ID | Опис | Звідки |
|----|------|--------|
| CR-3 | Hardcoded `#000000`/`#ffffff` у `story-reader-platform.ts` | UI-рев'ю (новий) |
| CR-6 | `app/preview.tsx` dead-end error state | UI-рев'ю (новий) |
| CR-7 | `story-manuscript-save.ts` production dedup silent drop | Код-рев'ю (новий) |
| UI-W9 | `SceneComposerPhone` дублікат `t('editor.blocks')` | UI-рев'ю (новий) |
| UI-W10 | `SplashScreenEditor` відсутній undo path | UI-рев'ю (новий) |
| WR-5..WR-11 | Різні якість/консистентність issues | Код-рев'ю (нові) |

---

## 📂 Знахідки за підсистемами

| Підсистема | CRITICAL | WARNING | INFO | Стан |
|------------|---------:|--------:|-----:|------|
| **Reader** (app/reader, hooks/useReader*, lib/reader-*) | 1 | 1 | 0 | useTypewriter регресія |
| **Editor (visual)** (SceneComposer, Preview, Timeline) | 1 | 3 | 1 | Audio service, hex+alpha, shadow color |
| **Document Editor** (document-editor/, manuscript/) | 1 | 6 | 0 | Найбільший regression source |
| **Auth / Home / Settings** (app/oauth, app/tabs, app/settings) | 0 | 3 | 0 | console.*, Language type |
| **Core Infra** (lib/engine, lib/_core, lib/audio-*) | 0 | 4 | 1 | conditionUtils, persistent-storage |
| **i18n / Translations** (lib/translations, lib/i18n) | 0 | 1 | 1 | 'pl' missing, 2-locale spec drift |
| **Story Manuscripts** (story-manuscript-save, manuscript/) | 1 | 1 | 0 | Production dedup + hex+alpha |
| **Shared UI** (components/StoryAutoSave, ErrorBoundary, etc.) | 0 | 0 | 3 | Чисто (позитивні patterns) |
| **Stores** (use-app-store, use-editor-store) | 0 | 0 | 0 | Zustand direct ✓ |
| **Hooks & Misc** (useSceneImages, useCharacterAnimations) | 0 | 1 | 0 | `loadStories` misleading name |
| **Platform Layer** (lib/story-reader-platform) | 1 | 0 | 0 | Hardcoded black/white fallbacks |
| **Theme/Tokens** (lib/_core/theme, lib/design-tokens) | 0 | 0 | 1 | `withAlpha` ✅, `typeScale` потребує доповнення |

---

## 🎯 Cross-Cutting Patterns

1. **AGENTS.md "withAlpha only" rule не retrofitted** — `withAlpha` helper існує, але 10+ сайтів все ще використовують hex+alpha concat. Phase 14 додав helper, але не зробив міграцію consumers. Це найбільший клас issues.

2. **`document-editor/` subtree — single source of regression** — Phase 13 ввів нову систему без UI-SPEC compliance перевірки. 4+ нових P0 порушень у кожному з пілорів 3, 4, 5.

3. **`__DEV__` guard для non-console code — footgun** — `story-manuscript-save.ts` показує патерн: `if (__DEV__)` блок з `console.warn` І business logic. Рекомендація: ESLint rule проти `__DEV__` навколо non-`console.*` коду.

4. **Phase 14 plan ≠ git log** — `14-PLAN.md` має Task 5 (useTypewriter), але коміту немає. Convention: кожен plan task → verifiable commit, або amend plan.

5. **i18n coverage зросла, але не завершена** — 21 hardcoded string залишились, здебільшого в `document-editor/` subtree (нові файли).

6. **Позитивний патерн: `PropertiesPanel` decomposition** — WR-2 розбив 1094-LOC моноліт на 17 фокусних файлів (97-LOC orchestrator + 12 forms по ~80 LOC + chrome/picker/shared/registry/types). Це шаблон для майбутніх рефакторів.

---

## 📈 Score Evolution

| Аудит | Score | Дата | Тренд |
|-------|-------|------|-------|
| audit-2026-06-02 | 7.0/10 | 2026-06-02 | — |
| audit-2026-06-04 | 7.2/10 | 2026-06-04 | ↑ (Phase 13 fixes) |
| **Цей аудит** | **6.8/10** | **2026-06-04** | **⬇️** (виявлено 6 регресій + 4 нові) |

UI пілор evolution:
| Дата | Copy | Visuals | Color | Typo | Spacing | ExpDesign | Total |
|------|------|---------|-------|------|---------|-----------|-------|
| 2026-05-28 | 2 | 2 | 3 | 3 | 4 | 3 | 15/24 |
| 2026-06-04 (ранок) | — | — | — | — | — | — | 6.5/10 (UX) |
| **2026-06-04 (deep)** | **2** | **2** | **1** ⬇️ | **2** ⬇️ | **3** ⬇️ | **3** | **13/24** ⬇️ |

---

**Згенеровано:** 2026-06-04  
**Аудитори:** gsd-code-reviewer (187 files), gsd-ui-auditor (47 files)  
**Див. також:** `PLAN-FIXES-2026-06-04.md` для prioritized remediation plan
