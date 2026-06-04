---
project: Visual Novel Engine
date: 2026-06-04
type: remediation-plan
based_on: AUDIT-FULL-2026-06-04.md
target_release: 0.9.0 (next milestone)
---

# 📋 План виправлень — Visual Novel Engine

**На основі:** `AUDIT-FULL-2026-06-04.md` (4 CRITICAL, 3 додаткові CRITICAL, 17 WARNING, 10 INFO)
**Загальна оцінка effort:** ~14-18 годин (з урахуванням review і тестування)
**Стратегія:** 3 фази — Critical (1-2 дні), Warnings (3-5 днів), Polish (1 тиждень)

---

## 🏁 ФАЗА 1: Критичні виправлення (4-6 годин, 1-2 дні)

**Мета:** Закрити всі CRITICAL, усунути user-visible bugs та P0 порушення UI-SPEC. Після цієї фази можна робити Beta release.

### 1.1 `useTypewriter` textSpeed re-read fix [CR-1] — 1h
- **Файл:** `hooks/useTypewriter.ts`
- **Fix:** Додати `textSpeedRef`, читати `charDelayMs(textSpeedRef.current)` у кожному interval tick
- **Тест:** Додати unit test у `__tests__/unit/hooks/useTypewriter.test.ts` (створити якщо немає)
- **Acceptance:** Зміна textSpeed під час друку негайно впливає на наступний символ
- **Commit pattern:** `fix(15-01): CR-1 useTypewriter mid-typing speed change`

### 1.2 8 hex-alpha concat сайтів [CR-2] — 15min
- **Файли (8):** `DocumentSceneSidebar.tsx:30`, `DocumentBlockDialogue.tsx:97,98`, `DocumentCommandMenu.tsx:104`, `DocumentChip.tsx:35,36`, `StoryManuscriptBlock.tsx:303`, `StoryManuscriptSidebar.tsx:57`
- **Fix:** `import { withAlpha } from '@/lib/_core/theme'` + заміна кожного сайту
- **Додатково:** `PreviewScreen.tsx:303`, `TimelinePanel.tsx:169` (shadow color)
- **Acceptance:** `grep -rn '\${colors\.[a-z0-9_]*}[0-9a-fA-F]\{2\}' components/ app/` повертає 0 результатів
- **Commit pattern:** `fix(15-01): CR-2 withAlpha migration in document-editor subtree`

### 1.3 Hardcoded black/white fallbacks [CR-3] — 30min
- **Файл:** `lib/story-reader-platform.ts:7, 17`
- **Fix:** `null` замість `'#000000'`/`'#ffffff'`; оновити типи; перевірити споживачів
- **Тест:** Перевірити на Android/iOS build через EAS preview
- **Acceptance:** Native reader не "мерехтить" білим перед ініціалізацією теми
- **Commit pattern:** `fix(15-01): CR-3 remove hardcoded color fallbacks`

### 1.4 IconSymbol MAPPING extension + Unicode glyph replacement [CR-4] — 1.5h
- **Файл A:** `components/ui/icon-symbol.tsx` — додати `chevron.up/down`, `arrow.left/right`, `xmark`, `checkmark`, `plus.circle`, `minus`, `square.and.arrow.up`
- **Файли B (5):** `SplashScreenEditor.tsx:122,372`, `InteractiveObjectsEditor.tsx:124`, `PreviewScreen.tsx:280`, `SceneSelector.tsx:390,518`, `SceneComposerPhone.tsx:191`
- **Fix:** Замінити ▲▼←→✓ на `<IconSymbol name="...">`
- **Acceptance:** `grep -P '[▲▼←→✓✕✖]` components/ app/` повертає 0 результатів (окрім LanguageSelector для flag emoji — дозволено per UI-SPEC)
- **Commit pattern:** `fix(15-01): CR-4 IconSymbol MAPPING + Unicode glyph replacement`

### 1.5 21 hardcoded a11y strings [CR-5] — 3h
- **Файли (10):** `app/preview.tsx:18,26`, `SplashScreenEditor.tsx:387`, `MiniPreview.tsx:170`, `story-reader-responsive.tsx:270`, `ReaderControls.tsx:89,96,119`, `panel-chrome.tsx:55,91,105`, `asset-field.tsx:36,39`, `DocumentBlockChoice.tsx:66,67,93,94`, `DocumentBlockDialogue.tsx:110,136`, `DocumentPage.tsx:138,219,270`
- **Fix:**
  1. Додати translation keys до `lib/translations.ts` (EN/UK/PL):
     - `common.loading`, `common.noRouteProvided`
     - `splash.configured`, `splash.status`
     - `reader.continueHint`, `reader.hints.{back,menu,save}`
     - `editor.properties.{closeHint,duplicateHint,deleteHint,assetFieldHint}`
     - `editor.selectX`
     - `document.choice.{addOption,removeOption,editOption,moveOption}`
     - `document.dialogue.{characterHint,lineHint}`
     - `document.a11y.{sceneTitle,narration,slashCommandInput}`
  2. Замінити hardcoded strings на `t()`
- **Acceptance:** `grep -rn "accessibilityHint=\"[A-Z]" components/ app/` повертає 0 результатів
- **Commit pattern:** `fix(15-01): CR-5 localize 21 hardcoded a11y/UI strings`

### 1.6 `app/preview.tsx` dead-end error state [CR-6] — 15min
- **Файл:** `app/preview.tsx:18, 26`
- **Fix:** `<ActivityIndicator/>` + `t('common.loading')`; `t('document.invalidRoute')` + `<Button onPress={router.back()}>` для recovery
- **Acceptance:** Користувач завжди має шлях "назад" при відсутності story/scene ID
- **Commit pattern:** `fix(15-01): CR-6 preview error state has recovery action`

### 1.7 `story-manuscript-save.ts` production dedup [CR-7] — 5min
- **Файл:** `lib/editor/story-manuscript-save.ts:75-89`
- **Fix:** Винести `seenSourceStepIds` dedup з `if (__DEV__)` блоку; warning залишити в dev
- **Тест:** Додати unit test що перевіряє дедуплікацію в production mode (`__DEV__=false`)
- **Acceptance:** Дублікати step entries усуваються навіть у release builds
- **Commit pattern:** `fix(15-01): CR-7 story-manuscript production dedup`

---

## 🟡 ФАЗА 2: Попередження (8-10 годин, 3-5 днів)

**Мета:** Закрити всі WARNING, усунути quality issues, підготувати код для Production release.

### 2.1 PreviewScreen audio service singleton [WR-1] — 30min
- **Файл:** `components/editor/PreviewScreen.tsx:41`
- **Fix:** Замінити `useRef(new AudioPlayerService())` на `import { enhancedAudioManager } from '@/lib/audio-manager-enhanced'`
- **Commit:** `refactor(15-02): WR-1 PreviewScreen audio service singleton`

### 2.2 Unguarded `console.*` у `tabs/index.tsx` [WR-2] — 5min
- **Файл:** `app/tabs/index.tsx:156,164,191`
- **Fix:** Обгорнути кожен `console.*` в `if (__DEV__) { ... }`
- **Commit:** `fix(15-02): WR-2 __DEV__ guards on tabs console`

### 2.3 `Language` type add `'pl'` [WR-3] — 1-2h
- **Файли:** `lib/translations.ts:1, 980`, `components/LanguageSelector.tsx`
- **Fix:**
  1. `type Language = 'en' | 'uk' | 'pl'`
  2. Додати `pl` translations (можна як fallback на `en` спочатку)
  3. Додати опцію у LanguageSelector
- **Decision needed:** Чи restore повний PL переклад (3-5h), чи почнемо з fallback (1h)
- **Commit:** `feat(15-02): WR-3 add Polish locale support`

### 2.4 Render-time setState у `DocumentSceneEditor` [WR-6] — 15min
- **Файл:** `components/document-editor/DocumentSceneEditor.tsx:94-101`
- **Fix:** Використати `useRef` для prev-prop tracker + `useEffect` для sync local state
- **Acceptance:** Strict mode не показує "Cannot update component while rendering" warning
- **Commit:** `fix(15-02): WR-6 DocumentSceneEditor render-time setState`

### 2.5 Inline fontSize у document-editor [UI-W1..W4] — 1.5h
- **Файли (5):** `DocumentPage.tsx:136`, `DocumentEditorHeader.tsx:66,70,85`, `DocumentSceneSidebar.tsx:20,35,36`, `DocumentTechnicalPropertiesPanel.tsx:50,365,366`
- **Fix:**
  1. Додати `lib/design-tokens.ts` tokens: `typeScale.documentTitle: 36/42`, `typeScale.propertiesTitle: 18/24`, `typeScale.headerSubtitle: 16/22`
  2. Замінити inline values на `...typeScale.*`
- **Acceptance:** `grep -rn "fontSize: [0-9]" components/document-editor/` повертає 0 результатів
- **Commit:** `refactor(15-02): UI-W1..W4 typeScale migration in document-editor`

### 2.6 Magic spacing у document-editor [UI-W5..W8] — 1.5h
- **Файли (4):** `DocumentSceneSidebar.tsx`, `DocumentPage.tsx`, `DocumentEditorHeader.tsx`, `DocumentTechnicalPropertiesPanel.tsx`
- **Fix:**
  1. Додати `headerHeight.phone: 76`, `headerHeight.desktop: 56` до `lib/design-tokens.ts`
  2. Замінити всі off-scale values (10, 11, 14, 18, 42, 76) на `spacing.*` tokens
- **Acceptance:** `grep -rn "padding: 1[0-4]\|marginBottom: 1[0-4]\|paddingTop: 1[0-4]" components/document-editor/` повертає 0 результатів
- **Commit:** `refactor(15-02): UI-W5..W8 spacing tokenization in document-editor`

### 2.7 SceneComposerPhone дублікат `editor.blocks` [UI-W9] — 5min
- **Файл:** `components/editor/SceneComposerPhone.tsx:209, 247`
- **Fix:** Видалити header pill на `:209`, залишити tab на `:247`
- **Commit:** `fix(15-02): UI-W9 SceneComposerPhone dedupe editor.blocks label`

### 2.8 SplashScreenEditor undo path [UI-W10] — 1h
- **Файл:** `components/SplashScreenEditor.tsx`
- **Fix:** Confirm dialog перед applying preset; або store prior splash state у useState для last-action undo
- **Commit:** `feat(15-02): UI-W10 SplashScreenEditor undo path`

### 2.9 Усі WR-5..WR-11 (код-рев'ю quality) [WR-5..WR-11] — 2-3h
- **WR-5:** `useSceneExecutor.selectChoice` document contract або auto-advance — 1-2h
- **WR-7:** `conditionUtils.toComparable` inline numeric coercion — 10min
- **WR-8:** `isEmpty` operator consistency з `has`/`not_has` — 5min
- **WR-9:** Rename `loadStories` → `migrateLegacyKeys` + JSDoc — 5min
- **WR-10:** `isValidUser` type guard comment — 2min
- **WR-11:** `createPersistentStorage` SSR noop warning — 5min
- **Commit:** `refactor(15-02): WR-5..WR-11 quality/consistency batch fixes`

---

## 🟢 ФАЗА 3: Polish і DX (5-8 годин, 1 тиждень)

**Мета:** Закрити всі INFO, додати запобіжники для запобігання регресій.

### 3.1 ESLint rules для запобігання регресій
1. **Ban hex+alpha string concat outside `lib/_core/theme.ts`**:
   ```json
   {
     "selector": "TemplateElement[value.raw=/\\$\\{[a-zA-Z]+\\}[0-9a-fA-F]{2}/]",
     "message": "Use withAlpha() helper instead of hex+alpha string concat"
   }
   ```
2. **Warn on `__DEV__` block containing non-`console.*` code**
3. **Warn on hardcoded color literals outside `lib/_core/theme.ts`/`lib/design-tokens.ts`**
- **Effort:** 2h
- **Commit:** `chore(15-03): ESLint rules to prevent Phase 14 regressions`

### 3.2 Design tokens codemod
- **Tool:** jscodeshift script
- **Input:** `fontSize: 11/12/14/16/17/18/20/32/36`, `padding: <off-scale>`
- **Output:** `...typeScale.<token>`, `spacing.<token>`
- **Effort:** 1.5h
- **Commit:** `chore(15-03): codemod for typeScale/spacing tokenization`

### 3.3 `lib/translations.ts` розбити на `locales/{en,uk,pl}.ts` — 2h
- **Поточний:** моноліт 947 LOC з 3 мовами
- **Fix:** Розділити на окремі файли + `index.ts` aggregator
- **Commit:** `refactor(15-03): split translations.ts by locale`

### 3.4 `use-app-store.ts` розбити на slices — 2-3h
- **Поточний:** 479 LOC моноліт
- **Fix:** `storiesSlice`, `scenesSlice`, `playbackSlice`, `settingsSlice`, `librariesSlice` (zustand slice pattern)
- **Commit:** `refactor(15-03): use-app-store slice decomposition`

### 3.5 Спека/code drift resolution [P2.1] — 30min
- **Decision:** Оновити UI-SPEC.md до 2 locales (швидко), АБО restore PL переклад
- **Рекомендація:** Restore PL, оскільки 2.3 вже додає 'pl' type — узгодженість
- **Commit:** `docs(15-03): resolve 2-vs-3 locale spec drift`

### 3.6 Дедуплікація трьох редакторів [Phase 4 candidate]
- **Проблема:** Lego, Document, SceneComposer — ~2000+ LOC дублювання
- **Рекомендація:** Визначити єдиний primary editor; інші — specialized variants
- **Статус:** Створити follow-up phase; не блокує реліз
- **Effort:** 1-2 тижні (окремий план)

---

## 🛡️ Запобіжники для запобігання майбутнім регресіям

### 4.1 Pre-commit hooks (`.husky/`)
```bash
# .husky/pre-commit
pnpm lint && pnpm test:unit --run && pnpm check:regressions
```

### 4.2 CI Gate (`.github/workflows/`)
- `pnpm test` — всі unit тести
- `pnpm check:regressions` — custom script що запускає grep перевірки
- `pnpm audit` — full code+ui audit (як цей)

### 4.3 Regression check script (`tools/check_regressions.sh`)
```bash
#!/bin/bash
set -e

echo "=== Hex+alpha concat (should be 0) ==="
grep -rn '\${colors\.[a-z0-9_]*}[0-9a-fA-F]\{2\}' components/ app/ \
  --include='*.tsx' --include='*.ts' \
  | grep -v 'lib/_core/theme' | grep -v 'lib/design-tokens' && exit 1 || echo "OK"

echo "=== Hardcoded English a11y (should be 0) ==="
grep -rPn 'accessibilityHint="[A-Z]' components/ app/ && exit 1 || echo "OK"

echo "=== Inline fontSize outside tokens (should be 0 in components/) ==="
grep -rPn "fontSize: ?[0-9]+" components/ app/ \
  --include='*.tsx' | grep -v 'typeScale' && exit 1 || echo "OK"

echo "=== Unguarded console.* (should be 0) ==="
grep -rPn '^\s*console\.(log|warn|error|info)\(' app/ hooks/ lib/ components/ \
  --include='*.ts' --include='*.tsx' \
  | grep -v 'if (__DEV__)' | grep -v '__DEV__' && exit 1 || echo "OK"

echo "All regression checks passed ✓"
```

---

## 📊 Tracking Matrix

### Critical (7)

| ID | Файл | Effort | Phase 1 commit |
|----|------|--------|----------------|
| CR-1 | `hooks/useTypewriter.ts:14-31` | S (1h) | `fix(15-01): CR-1 useTypewriter mid-typing speed change` |
| CR-2 | 10 files | XS (15min) | `fix(15-01): CR-2 withAlpha migration in document-editor subtree` |
| CR-3 | `lib/story-reader-platform.ts:7,17` | S (30min) | `fix(15-01): CR-3 remove hardcoded color fallbacks` |
| CR-4 | `icon-symbol.tsx` + 5 files | S (1.5h) | `fix(15-01): CR-4 IconSymbol MAPPING + Unicode glyph replacement` |
| CR-5 | 10 files | M (3h) | `fix(15-01): CR-5 localize 21 hardcoded a11y/UI strings` |
| CR-6 | `app/preview.tsx:18,26` | XS (15min) | `fix(15-01): CR-6 preview error state has recovery action` |
| CR-7 | `lib/editor/story-manuscript-save.ts:75-89` | XS (5min) | `fix(15-01): CR-7 story-manuscript production dedup` |

**Phase 1 total: ~6.5h, 11 atomic commits**

### Warnings (17)

| ID | Файл | Effort | Phase 2 commit |
|----|------|--------|----------------|
| WR-1 | `components/editor/PreviewScreen.tsx:41` | S (30min) | `refactor(15-02): WR-1 PreviewScreen audio service singleton` |
| WR-2 | `app/tabs/index.tsx:156,164,191` | XS (5min) | `fix(15-02): WR-2 __DEV__ guards on tabs console` |
| WR-3 | `lib/translations.ts:1,980` | S-S (1-2h) | `feat(15-02): WR-3 add Polish locale support` |
| WR-5 | `lib/engine/useSceneExecutor.ts:284-318` | S (1-2h) | `docs(15-02): WR-5 useSceneExecutor.selectChoice contract` |
| WR-6 | `components/document-editor/DocumentSceneEditor.tsx:94-101` | S (15min) | `fix(15-02): WR-6 DocumentSceneEditor render-time setState` |
| WR-7 | `lib/engine/conditionUtils.ts:5-10` | XS (10min) | `refactor(15-02): WR-7 conditionUtils inline coercion` |
| WR-8 | `lib/engine/conditionUtils.ts:38` | XS (5min) | `fix(15-02): WR-8 isEmpty consistency` |
| WR-9 | `lib/story-hooks.ts:372` | XS (5min) | `refactor(15-02): WR-9 loadStories rename + JSDoc` |
| WR-10 | `lib/_core/auth.ts:24-30` | XS (2min) | `docs(15-02): WR-10 isValidUser comment` |
| WR-11 | `lib/persistent-storage.ts:18-26` | XS (5min) | `fix(15-02): WR-11 createPersistentStorage SSR warning` |
| UI-W1 | `DocumentPage.tsx:136` | S (10min) | bundled with W2-W4 |
| UI-W2 | `DocumentEditorHeader.tsx:66,70,85` | S (30min) | `refactor(15-02): UI-W1..W4 typeScale migration` |
| UI-W3 | `DocumentSceneSidebar.tsx:20,35,36` | S (15min) | bundled with W2 |
| UI-W4 | `DocumentTechnicalPropertiesPanel.tsx:50,365,366` | S (30min) | bundled with W2 |
| UI-W5 | `DocumentSceneSidebar.tsx:19-36` | S (30min) | bundled with W6-W8 |
| UI-W6 | `DocumentPage.tsx:108-266` | S (30min) | `refactor(15-02): UI-W5..W8 spacing tokenization` |
| UI-W7 | `DocumentEditorHeader.tsx:40-49` | S (20min) | bundled with W6 |
| UI-W8 | `DocumentTechnicalPropertiesPanel.tsx:47-366` | S (30min) | bundled with W6 |
| UI-W9 | `SceneComposerPhone.tsx:209,247` | XS (5min) | `fix(15-02): UI-W9 SceneComposerPhone dedupe` |
| UI-W10 | `SplashScreenEditor.tsx` | S (1h) | `feat(15-02): UI-W10 SplashScreenEditor undo` |

**Phase 2 total: ~8-10h, 7 atomic commits (batched)**

### Info (10)

| ID | Effort | Phase 3 commit |
|----|--------|----------------|
| IN-1 (scene-operations TODO) | XS (5min) | bundled with code cleanup |
| IN-2 (PropertiesPanel positive) | — | No action |
| IN-3 (charDelayMs test) | XS (15min) | `test(15-03): IN-3 charDelayMs unit test` |
| IN-4 (play.tsx positive) | — | No action |
| IN-5 (ErrorBoundary positive) | — | No action |
| IN-6 (as any count) | — | No action |
| IN-7 (ESLint disables) | — | No action |
| `lib/engine/types.ts` hex block colors | S (30min) | `docs(15-03): document block-category color intent` |
| 2-locale vs 3-locale spec | XS (30min) | `docs(15-03): resolve locale spec drift` |
| IconSymbol MAPPING gap | covered by CR-4 | — |
| ESLint regression rules | M (2h) | `chore(15-03): ESLint rules to prevent regressions` |
| Codemod for tokens | M (1.5h) | `chore(15-03): tokenization codemod` |
| translations.ts split | M (2h) | `refactor(15-03): split translations.ts by locale` |
| use-app-store.ts slices | L (2-3h) | `refactor(15-03): use-app-store slice decomposition` |

**Phase 3 total: ~8-10h, 4-5 atomic commits**

---

## 🎯 Release Readiness

| Фаза | Готовність | Можна релізити? |
|------|------------|-----------------|
| Phase 1 завершена | Beta-ready | ✅ Так (закриває user-visible bugs і P0) |
| Phase 2 завершена | Production-ready | ✅ Так (quality + consistency) |
| Phase 3 завершена | DX-вилизане | ✅ Так (запобіжники від регресій) |

**Мінімальний MVP release:** Phase 1 (~6.5h, 1-2 дні)
**Рекомендований release:** Phase 1 + Phase 2 (~14-16h, 4-5 днів)
**Повний polish:** Phase 1 + 2 + 3 (~22-26h, 1.5-2 тижні)

---

## 📞 Decision Points (запитати користувача)

1. **WR-3 (Polish locale):** Restore повний PL переклад (3-5h) vs fallback to EN (1h)?
2. **3.5 (Locale spec):** Оновити UI-SPEC до 2 locales, чи restore PL?
3. **3.4 (Store slices):** Чи включати у цей реліз, чи в окремий phase?

---

**Створено:** 2026-06-04
**На основі:** `AUDIT-FULL-2026-06-04.md`
**Очікуваний час повного виконання:** 22-26 годин (1.5-2 тижні для однієї людини)
