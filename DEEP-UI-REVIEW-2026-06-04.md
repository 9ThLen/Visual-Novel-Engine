---
project: Visual Novel Engine
phase: deep-ui-audit-2026-06-04
date: 2026-06-04
auditor: gsd-ui-review (opencode/minimax-m3-free)
baseline: UI-SPEC.md + abstract 6-pillar standards
compares_against:
  - UI-REVIEW.md (2026-05-28, 15/24)
  - audit-2026-06-04.md (UX 6.5/10)
  - audit-2026-06-02.md (UX 7.0/10, security)
screenshots: not-captured (no dev server detected in audit mode)
files_audited: 38 .tsx / 6 lib/ contracts / 3 app/ routes
pillar_scores:
  copywriting: 2
  visuals: 2
  color: 1
  typography: 2
  spacing: 3
  experience_design: 3
overall: 13/24
top_severity: CRITICAL
regressed_from_baseline: true
regressions:
  - "P3 color: 6+ new sites using ${colors.primary}NN hex+alpha hack (M2 'withAlpha' migration regressed)"
  - "P4 typography: 6+ new inline fontSize literals in document-editor/ subcomponents"
  - "P5 spacing: 1px and non-scale values in document-editor page padding/margins"
---

# Deep UI Review — Visual Novel Engine

**Audit date:** 2026-06-04
**Auditor:** opencode/minimax-m3-free (gsd-ui-review orchestrator)
**Baseline:** `UI-SPEC.md` + abstract 6-pillar standards
**Scope:** 38 components + 6 lib contracts + 3 app routes
**Screenshots:** Not captured (no dev server detected in code-only audit mode)

---

## 1. Executive Summary

The implementation has **moved past the May 28 baseline on most blocks** (P5 spacing, P6 experience design, P1 the `manuscript.dialogue` key) but **regressed on three of the six pillars** since the M2/M3 remediation waves. The most critical finding is a **systemic regression on the color pillar**: the M2-era `withAlpha()` migration was partially undone. The `lib/_core/theme.ts` helper exists, is imported in 19 files, but a separate cohort of `document-editor/` and `manuscript/` files uses the legacy `` `${colors.primary}NN` `` hex+alpha string-concatenation hack in 6+ places. The same anti-pattern was the very thing M2 was supposed to retire.

Beyond color, **typography is leaking hardcoded numeric `fontSize` values** (11/14/16/18/20/36) across the freshly-added `document-editor/` subtree that bypasses `lib/design-tokens.ts` `typeScale`. **Visual hierarchy degrades** because 4 files use Unicode geometric glyphs (▲▼←→) and a ✓ checkmark as primary command/nav controls in violation of UI-SPEC §P0.

The good news: **i18n coverage is materially better** (`manuscript.dialogue` is now present in both EN/UK; the new `document.*` namespace is consistently used in the new code paths). **Layout primitives and accessible headers** are well-tokenized in `app/`, `components/ui/`, and the older `editor/` subcomponents. **Error boundary + toast + confirm dialogs** are wired up correctly.

**Overall: 13/24** — down 2 points from the May 28 15/24 baseline, due to the color regression and document-editor typography/spacing leak.

### Top 3 priority fixes

1. **[CRITICAL, S] Replace `` `${colors.primary}NN` `` with `withAlpha()` in 6+ files** — `document-editor/DocumentSceneSidebar.tsx:30`, `document-editor/DocumentBlockDialogue.tsx:97-98`, `document-editor/DocumentCommandMenu.tsx:104`, `document-editor/DocumentChip.tsx:35-36`, `editor/manuscript/StoryManuscriptBlock.tsx:303`, `editor/manuscript/StoryManuscriptSidebar.tsx:57`. The hex+alpha string-concat is not alpha-correct for OKLCH sRGB rounding, breaks dark-mode high-contrast previews, and directly regresses M2. Fix: import `withAlpha` from `@/lib/_core/theme` (already exists) and call `withAlpha(colors.primary, 0.07)` etc.
2. **[CRITICAL, S] Remove `'#000000'` and `'#ffffff'` fallbacks in `lib/story-reader-platform.ts:7,17`** — these hardcoded theme values leak to native modules that don't pass the `colors` object. On Android/iOS reader where `useColors()` may not be ready, the platform layer injects a fixed black/white that conflicts with OKLCH tokens. Fix: fall back to a defined token constant (e.g. `RUNTIME_PALETTE.background`) or `null`/transparent.
3. **[WARNING, S] Replace inline numeric `fontSize` in `document-editor/` subtree with `typeScale` tokens** — `DocumentPage.tsx:136 (36)`, `DocumentEditorHeader.tsx:66,70,85 (20/14/11/16)`, `DocumentSceneSidebar.tsx:20,35,36 (11/14/12)`, `DocumentTechnicalPropertiesPanel.tsx:50,365,366 (14/11/18)`. None reference `lib/design-tokens.ts`. Fix: import `typeScale` and spread `...typeScale.pageTitle` etc.

---

## 2. Pillar Scores

| # | Pillar | Score | Justification |
|---|--------|-------|---------------|
| 1 | Copywriting | 2/4 | ~14 hardcoded English strings (a11y hints, placeholders, status text, error fallbacks). 2-locale drift from 3-locale spec. Translation key coverage for new `document.*` namespace is good; `manuscript.dialogue` regression from May 28 fixed. |
| 2 | Visuals | 2/4 | 4 files use Unicode glyphs (▲▼←→) and ✓ as primary command controls, violating UI-SPEC §P0 (no emoji as nav/command). `IconSymbol` MAPPING missing `arrow.left/right`, `chevron.up/down`, `xmark`, `check`, `plus.circle`, `minus` — forcing these workarounds. SceneComposerPhone uses `chevron.right` rotated 180° to fake a back arrow. |
| 3 | Color | 1/4 | 6+ new sites of `` `${colors.primary}NN` `` hex+alpha hack (regression of M2 fix). `'#000000'`/`'#ffffff'` hardcoded in `lib/story-reader-platform.ts:7,17` (CRITICAL — undermines entire theme). 12 hex block-category colors in `lib/engine/types.ts:70-81`. `'#000'` shadowColor in `TimelinePanel.tsx:169`. |
| 4 | Typography | 2/4 | ~10 inline numeric `fontSize` literals in `document-editor/` subcomponents bypass `typeScale`. Most are off-scale (11, 36, 18, 20). typeScale itself is well-defined (5 sizes: pageTitle 32, sectionTitle 20, body 17, label 14, caption 12, micro 11); 18 and 36 are off-scale entirely. Most other code uses tokens correctly. |
| 5 | Spacing | 3/4 | Most files use `spacing.*` and `radius.*` tokens. Localized leaks in `document-editor/`: `padding: 14, marginBottom: 8` (`DocumentSceneSidebar.tsx`), `paddingVertical: 42, marginBottom: 1` (`DocumentPage.tsx`), `paddingTop: 10, gap: 14` (`DocumentEditorHeader.tsx`), `paddingHorizontal: 11, paddingVertical: 9, marginBottom: 10` (`DocumentTechnicalPropertiesPanel.tsx`). All non-scale (10/11/14/18/42/76). |
| 6 | Experience Design | 3/4 | ErrorBoundary, ToastViewport, ConfirmDialog, ReaderAudioRouteGuard, StoryAutoSave, MigrationErrorBanner all present and wired. Loading states present in editor screens. Empty states handled in `app/editor.tsx` (no-stories). Tap-twice-to-delete pattern in `useBlockOperations` is good. Destructive delete uses Alert.alert with cancel. **Deductions:** `app/preview.tsx:18,26` have hardcoded `<Text>Loading...</Text>` and `<Text>No story or scene ID provided</Text>` (no spinner, no error toast, no recovery action); SplashScreenEditor has no undo for applied presets; SceneComposerPhone has 2 redundant `t('editor.blocks')` text labels (lines 209, 247) which screen-readers will read as duplicated. |

**Overall: 13/24**

---

## 3. Findings by Pillar

### Pillar 1 — Copywriting (2/4)

**Strengths**
- New `document.*` translation namespace in `lib/translations.ts` is consistently used in `DocumentSceneEditor`, `DocumentPage`, `DocumentBlockDialogue`, `DocumentBlockChoice`, `DocumentEditorHeader`, `DocumentSceneSidebar`, `DocumentTechnicalPropertiesPanel`, `DocumentChip`, `DocumentCommandMenu`. EN/UK coverage is complete for the keys actually used.
- `manuscript.dialogue` key is present in both EN (`"Dialogue"`) and UK (`"Діалог"`) — UI-REVIEW.md's #1 finding from 2026-05-28 is **fixed**.
- `t()` is used in: `app/editor.tsx`, `app/document-editor.tsx`, `app/settings.tsx`, `app/tabs/index.tsx`, `app/reader.tsx`, `app/save-load.tsx`, `components/editor/SceneComposerPhone.tsx`, `components/document-editor/*`, `components/editor/SceneComposerDesktop.tsx`, `components/ui/Button.tsx`, `components/ui/ConfirmDialog.tsx`, `components/ui/Toast.tsx`, `components/ErrorBoundary.tsx`, `components/LanguageSelector.tsx`, `components/ReaderMenu.tsx`, `components/WebSidebar.tsx`, `components/WebTopBar.tsx`, `components/dialogue-history.tsx`.

**Warnings**

| Severity | File:line | Finding | Concrete fix |
|----------|-----------|---------|--------------|
| WARNING | `app/preview.tsx:18` | `<Text>Loading...</Text>` hardcoded; no i18n, no spinner | Use `<ActivityIndicator size="large"/>` + `<Text>{t('common.loading')}</Text>` — add `common.loading` key if missing |
| WARNING | `app/preview.tsx:26` | `<Text>No story or scene ID provided</Text>` hardcoded | Use `t('document.invalidRoute')` (already exists) |
| WARNING | `components/SplashScreenEditor.tsx:387` | `Splash configured • {splash?.duration}ms • {splash?.type}` — status string with English separators and units | Add `splash.status` key, use `splash.configured` interpolation, replace `ms` with localized unit |
| WARNING | `components/editor/MiniPreview.tsx:170` | `"Loading..."` hardcoded | Use `t('common.loading')` |
| WARNING | `components/story-reader-responsive.tsx:270` | `continueAccessibilityHint="Tap to advance text or make a choice"` hardcoded | Use `t('reader.continueHint')` |
| WARNING | `components/reader/ReaderControls.tsx:89,96,119` | 3 hardcoded `accessibilityHint` strings (back/menu/save) | Add `reader.hints.*` keys |
| WARNING | `components/editor/properties/panel-chrome.tsx:55` | `accessibilityHint="Close properties panel"` hardcoded | Use `t('editor.properties.closeHint')` |
| WARNING | `components/editor/properties/panel-chrome.tsx:91` | `accessibilityHint="Duplicate this block"` hardcoded | Use `t('editor.properties.duplicateHint')` |
| WARNING | `components/editor/properties/panel-chrome.tsx:105` | `accessibilityHint="Delete this block from timeline"` hardcoded | Use `t('editor.properties.deleteHint')` |
| WARNING | `components/editor/properties/asset-field.tsx:36` | `` placeholder={`Select ${category}...`} `` hardcoded | Use `t('editor.selectX', { x: category })` — requires pluralization support or two keys |
| WARNING | `components/editor/properties/asset-field.tsx:39` | `accessibilityHint="Enter asset ID or tap search to browse"` hardcoded | Use `t('editor.properties.assetFieldHint')` |
| WARNING | `components/document-editor/DocumentBlockChoice.tsx:66,67,93,94` | 4 hardcoded a11y labels (e.g. "Add choice option", "Remove choice") | Add `document.choice.*` keys |
| WARNING | `components/document-editor/DocumentBlockDialogue.tsx:110,136` | 2 hardcoded a11y hints | Add `document.dialogue.*` keys |
| WARNING | `components/document-editor/DocumentPage.tsx:138,219,270` | 3 hardcoded a11y hints ("Scene title", "Narration or story text", "Type / for commands, Enter to add line") | Add `document.a11y.*` keys |
| INFO | `lib/translations.ts` | `Language` type is `'en' \| 'uk'` (2 locales); UI-SPEC.md §Localization says EN/UK/PL (3 locales) | Spec/code drift — either update spec or restore PL translations. Code is functional with 2 locales. |

### Pillar 2 — Visuals (2/4)

**Strengths**
- `IconSymbol` exists at `components/ui/icon-symbol.tsx` and is used in: `LanguageSelector`, `SceneComposerPhone`, `DocumentEditorHeader`, `WebSidebar`, `WebTopBar`, `ReaderMenu`, `app/settings`, `app/reader`, `app/save-load`. Mappings cover 40+ SF Symbols.
- Visual hierarchy: hero section in `app/editor.tsx` uses `typeScale.pageTitle` for title, `typeScale.caption` for eyebrow, `typeScale.body` for subtitle — clear.
- `confirm delete` action in SceneComposer uses `ConfirmDialog destructive` variant (correct UI pattern).
- `ToastViewport` is mounted in `app/_layout.tsx` (correct position).

**Critical/Warning**

| Severity | File:line | Finding | Concrete fix |
|----------|-----------|---------|--------------|
| CRITICAL | `components/editor/SplashScreenEditor.tsx:122` | `▲`/`▼` Unicode glyphs as expand/collapse control | Add `chevron.up`/`chevron.down` to `IconSymbol` MAPPING; replace |
| CRITICAL | `components/editor/SplashScreenEditor.tsx:372` | `✓` Unicode checkmark as checkbox indicator | Add `checkmark`/`check` to `IconSymbol` MAPPING; replace |
| CRITICAL | `components/InteractiveObjectsEditor.tsx:124` | `▲`/`▼` Unicode glyphs as expand/collapse | Add `chevron.up`/`chevron.down` to `IconSymbol` MAPPING; replace |
| CRITICAL | `components/editor/PreviewScreen.tsx:280` | `←` Unicode arrow as back button | Use `IconSymbol name="chevron.left"` (MAPPING has it) or `arrow.left` |
| CRITICAL | `components/editor/SceneSelector.tsx:390,518` | `→` connector, `▼` input marker Unicode glyphs | Add `arrow.right` and `chevron.down` to MAPPING; replace |
| WARNING | `components/editor/SceneComposerPhone.tsx:191` | Uses `IconSymbol name="chevron.right"` rotated 180° to fake a back arrow (hack) | Add `chevron.left` to MAPPING (already present; just use it) — or `arrow.left` |
| WARNING | `components/editor/SceneComposerPhone.tsx:209,247` | Renders `t('editor.blocks')` as plain `<Text>` twice in same screen (header pill + tab); duplicates for screen-readers | Remove the duplicated pill OR use only one; consolidate to single nav entry |
| INFO | `components/ui/icon-symbol.tsx` | MAPPING missing: `chevron.up`, `chevron.down`, `arrow.left`, `arrow.right`, `xmark`, `checkmark`/`check`, `plus.circle`, `minus`, `square.and.arrow.up` | Extend MAPPING; this is the root cause of 4 of the 5 glyph violations |

### Pillar 3 — Color (1/4)

**Strengths**
- `withAlpha(color, alpha)` helper exists in `lib/_core/theme.ts`, exports `withAlpha` and is used in 19 component files (good coverage).
- `app/editor.tsx`, `app/tabs/index.tsx`, `components/SceneSelector.tsx`, `components/TimelinePanel.tsx`, `components/PropertiesPanel.tsx`, `components/SceneManager.tsx`, `components/ui/Button.tsx`, `components/ui/Toast.tsx`, `components/WebSidebar.tsx`, `components/WebTopBar.tsx`, `components/ReaderMenu.tsx`, `components/LanguageSelector.tsx` all use `withAlpha` or direct `colors.X` tokens.
- OKLCH → hex conversion is centralized; tokens live in `lib/_core/theme.ts` and `lib/design-tokens.ts`.

**Critical (P0 violations and regressions)**

| Severity | File:line | Finding | Concrete fix |
|----------|-----------|---------|--------------|
| **CRITICAL** | `lib/story-reader-platform.ts:7` | `'#000000'` hardcoded as default text color in `WEB_TEXT_COLOR_FALLBACK` | Replace with `null` or `colors.foreground` (the function receives theme via props in 2 of 3 call sites; make `null` the contract and have consumers resolve) |
| **CRITICAL** | `lib/story-reader-platform.ts:17` | `'#ffffff'` hardcoded as default background in `WEB_BG_COLOR_FALLBACK` | Replace with `null` or `colors.background` |
| **CRITICAL** | `components/document-editor/DocumentSceneSidebar.tsx:30` | `backgroundColor: scene.id === activeSceneId ? \`${colors.primary}12\` : colors.background` — hex+alpha string-concat | `withAlpha(colors.primary, 0.07)` (12 ≈ 0.07×255 / 100, but token-based 0.07 is the existing scale) |
| **CRITICAL** | `components/document-editor/DocumentBlockDialogue.tsx:97-98` | `\`${colors.primary}14\`` and `\`${colors.primary}55\`` hex+alpha string-concat | `withAlpha(colors.primary, 0.08)` and `withAlpha(colors.primary, 0.33)` |
| **CRITICAL** | `components/document-editor/DocumentCommandMenu.tsx:104` | `\`${toneColor}16\`` hex+alpha string-concat | `withAlpha(toneColor, 0.09)` |
| **CRITICAL** | `components/document-editor/DocumentChip.tsx:35-36` | `\`${toneColor}40\`` and `\`${toneColor}12\`` hex+alpha string-concat | `withAlpha(toneColor, 0.25)` and `withAlpha(toneColor, 0.07)` |
| **CRITICAL** | `components/editor/manuscript/StoryManuscriptBlock.tsx:303` | `\`${colors.primary}14\`` hex+alpha string-concat (M2 regression) | `withAlpha(colors.primary, 0.08)` |
| **CRITICAL** | `components/editor/manuscript/StoryManuscriptSidebar.tsx:57` | `\`${colors.primary}18\`` hex+alpha string-concat (M2 regression) | `withAlpha(colors.primary, 0.09)` |
| WARNING | `components/editor/TimelinePanel.tsx:169` | `shadowColor: '#000'` — hardcoded shadow color | Use `colors.foreground` or a defined `colors.shadow` token; shadows on dark theme need to be black but should be tokenized for opacity-based variants |
| INFO | `lib/engine/types.ts:70-81` | 12 hex literal block-type category colors (`'#3B82F6'` etc.) | If these are static category identifiers (Lego-block style), keep; otherwise migrate to OKLCH token constants. Tag with `@category-colors` and document intent. |

**Why this is CRITICAL:** The hex+alpha string-concat produces semantically-incorrect alpha for OKLCH colors (the hex representation in sRGB is rounded, then alpha is applied in display-p3). For colors at the edge of the sRGB gamut (e.g. saturated accent colors), this produces a muddy result. `withAlpha()` converts to display-p3 first, applies alpha in the wider gamut, and converts back — which is what the rest of the app uses.

### Pillar 4 — Typography (2/4)

**Strengths**
- `lib/design-tokens.ts` defines a clear typeScale: `pageTitle: 32, sectionTitle: 20, body: 17, label: 14, caption: 12, micro: 11` — well-tuned to RN/Expo.
- `app/editor.tsx` uses `typeScale.*` consistently via `...typeScale.pageTitle` spread.
- `app/settings.tsx`, `app/tabs/index.tsx`, `app/reader.tsx`, `app/save-load.tsx`, `components/LanguageSelector.tsx`, `components/ReaderMenu.tsx`, `components/WebSidebar.tsx`, `components/WebTopBar.tsx` follow the same pattern.
- Font weights are tightly controlled: `fontWeight: '700'` or `'800'` is the dominant pattern; `'600'` is used for tabs; normal body text uses default (400) — clean hierarchy.

**Warnings**

| Severity | File:line | Finding | Concrete fix |
|----------|-----------|---------|--------------|
| WARNING | `components/document-editor/DocumentPage.tsx:136` | `fontSize: 36` — off-scale (typeScale max is pageTitle:32) | Use `...typeScale.pageTitle` (32) or define a new `typeScale.documentTitle: 36` token |
| WARNING | `components/document-editor/DocumentEditorHeader.tsx:66` | `fontSize: isPhone ? 20 : 16` — 16 is off-scale (no body label=16 in typeScale) | Use `...typeScale.sectionTitle` (20) and `...typeScale.body` (17) respectively |
| WARNING | `components/document-editor/DocumentEditorHeader.tsx:70` | `fontSize: 14, lineHeight: 20` — duplicates typeScale.label | Use `...typeScale.label` |
| WARNING | `components/document-editor/DocumentEditorHeader.tsx:85` | `fontSize: 11, lineHeight: 13` — duplicates typeScale.micro (11) but with custom lineHeight | Use `...typeScale.micro` |
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:20` | `fontSize: 11, fontWeight: '700'` — typeScale.micro | Use `...typeScale.micro` |
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:35` | `fontSize: 14, fontWeight: '700'` — typeScale.label | Use `...typeScale.label` |
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:36` | `fontSize: 12` — typeScale.caption | Use `...typeScale.caption` |
| WARNING | `components/document-editor/DocumentTechnicalPropertiesPanel.tsx:50` | `fontSize: 14` in `fieldStyle()` helper — typeScale.label | Use `...typeScale.label` |
| WARNING | `components/document-editor/DocumentTechnicalPropertiesPanel.tsx:365,366` | `fontSize: 11` and `fontSize: 18` — 18 is off-scale entirely | Use `...typeScale.micro` (11) and add `typeScale.propertiesTitle: 18` token or use `...typeScale.sectionTitle` (20) |
| INFO | `components/SplashScreenEditor.tsx`, `components/InteractiveObjectsEditor.tsx`, `components/editor/SceneSelector.tsx`, `components/editor/PreviewScreen.tsx` | Not exhaustively checked for inline fontSize | Recommend running `grep -rn "fontSize: [0-9]" components/ app/` after fixes and verifying all matches are tokenized |

### Pillar 5 — Spacing (3/4)

**Strengths**
- `lib/design-tokens.ts` defines `spacing: {xs: 4, sm: 8, md: 12, lg: 16, xl: 24, 2xl: 32, 3xl: 48}` and `radius: {sm: 6, md: 8, lg: 12, xl: 16, full: 999}`.
- `app/editor.tsx`, `app/settings.tsx`, `app/tabs/index.tsx`, `app/reader.tsx`, `app/save-load.tsx`, `components/editor/SceneComposerPhone.tsx`, `components/ui/Button.tsx`, `components/ui/Toast.tsx` use these tokens consistently.
- `style={{ padding: 16 }}` style is rare; most uses are tokenized.

**Warnings**

| Severity | File:line | Finding | Concrete fix |
|----------|-----------|---------|--------------|
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:19` | `padding: 14` — off-scale (closest tokens: sm=8, md=12, lg=16) | Use `padding: spacing.md` (12) or `spacing.lg` (16) |
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:21` | `marginTop: 12` — matches `spacing.md` | Use `spacing.md` |
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:27` | `borderRadius: 8` — matches `radius.md` | Use `radius.md` |
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:32` | `padding: 10` — off-scale (between sm=8 and md=12) | Use `spacing.sm` (8) |
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:33` | `marginBottom: 8` — matches `spacing.sm` | Use `spacing.sm` |
| WARNING | `components/document-editor/DocumentSceneSidebar.tsx:36` | `marginTop: 4` — matches `spacing.xs` | Use `spacing.xs` |
| WARNING | `components/document-editor/DocumentPage.tsx:108` | `y: Math.max(0, layoutY - 12)` — magic number 12 | Use `spacing.md` |
| WARNING | `components/document-editor/DocumentPage.tsx:120` | `paddingHorizontal: 24` (phone) — matches `spacing.xl` | Use `spacing.xl` |
| WARNING | `components/document-editor/DocumentPage.tsx:120` | `paddingHorizontal: 48` (desktop) — off-scale (largest token is 3xl=48 actually a match, but inconsistently used) | Use `spacing['3xl']` (48) |
| WARNING | `components/document-editor/DocumentPage.tsx:121` | `paddingVertical: 28` (phone), `42` (desktop) — off-scale | Use `spacing.xl` (24) for phone, `spacing['2xl']` (32) or `'3xl'` (48) for desktop |
| WARNING | `components/document-editor/DocumentPage.tsx:122` | `marginBottom: 1` — off-scale (smallest token is xs=4) | Use `spacing.xs` (4) or remove |
| WARNING | `components/document-editor/DocumentPage.tsx:213,226,266` | `marginBottom: 10, marginTop: 12, paddingVertical: 12` — 10 is off-scale, 12 is `spacing.md` | Use `spacing.sm` (8) and `spacing.md` (12) |
| WARNING | `components/document-editor/DocumentEditorHeader.tsx:40` | `minHeight: safeTop + 76` — 76 is off-scale | Use `safeTop + (isPhone ? 88 : 56)` with `88 = 8*11` is also off-scale; add `headerHeight.phone: 76, headerHeight.desktop: 56` to tokens |
| WARNING | `components/document-editor/DocumentEditorHeader.tsx:41` | `paddingHorizontal: 18` — off-scale | Use `spacing.lg` (16) |
| WARNING | `components/document-editor/DocumentEditorHeader.tsx:42,43` | `paddingTop: 12, paddingBottom: 10, paddingTop: 10, paddingBottom: 10` — mixed | Use `spacing.md`/`spacing.sm` consistently |
| WARNING | `components/document-editor/DocumentEditorHeader.tsx:49` | `gap: 14` — off-scale | Use `spacing.md` (12) or `spacing.lg` (16) |
| WARNING | `components/document-editor/DocumentTechnicalPropertiesPanel.tsx:47,48,49` | `paddingHorizontal: 11, paddingVertical: 9, marginBottom: 10` — all off-scale | Use `spacing.md` (12) and `spacing.sm` (8) |
| WARNING | `components/document-editor/DocumentTechnicalPropertiesPanel.tsx:363,365,366` | `marginBottom: 14, fontSize: 11, marginTop: 4` — 14 off-scale, 4 matches `spacing.xs` | Use `spacing.md` (12) and `spacing.xs` (4) |

### Pillar 6 — Experience Design (3/4)

**Strengths**
- `<ErrorBoundary>` wraps entire app in `app/_layout.tsx`.
- `<ToastViewport>` mounted at root.
- `<StoryAutoSave>`, `<ReaderAudioRouteGuard>`, `<MigrationErrorBanner>` all mounted at root for cross-cutting UX.
- Loading states: `ActivityIndicator` in `app/document-editor.tsx:78`, `app/editor.tsx` (no explicit loading — empty state instead), `app/reader.tsx`.
- Empty states: `app/editor.tsx:170-179` shows "no stories" with CTA. `app/save-load.tsx` has empty state for no saves.
- Destructive action confirmation: `Alert.alert` in `app/editor.tsx:99-112`, `ConfirmDialog destructive` in SceneComposer.
- Tap-twice-to-delete pattern in `useBlockOperations` (`handleEmptyBackspace`) is good UX for text-block deletion.
- Reader controls: back/menu/save buttons all have `accessibilityLabel` (correctly localized in most cases).
- LanguageSelector includes `nativeName` (e.g. "Українська") and country flag emoji — informational, not action (flag is acceptable per UI-SPEC §P0).
- `<Pressable accessibilityRole="button">` everywhere — proper touch target semantics.
- Web has `document.body.style.backgroundColor` set before React rendering to avoid white flash.

**Warnings**

| Severity | File:line | Finding | Concrete fix |
|----------|-----------|---------|--------------|
| WARNING | `app/preview.tsx:18` | Hardcoded `<Text>Loading...</Text>` (no spinner, no i18n) | Use `<ActivityIndicator size="large"/>` + `<Text>{t('common.loading')}</Text>` |
| WARNING | `app/preview.tsx:26` | Hardcoded `<Text>No story or scene ID provided</Text>` (no error toast, no recovery action — dead end) | Use `t('document.invalidRoute')` + a `<Button onPress={router.back()}>{t('common.back')}</Button>` to give the user a way out |
| WARNING | `components/editor/SceneComposerPhone.tsx:209,247` | `t('editor.blocks')` rendered as plain `<Text>` twice on the same screen — screen-reader announces "Blocks" twice on first focus | Consolidate: remove one of the two (recommend the header pill at 209; keep the tab at 247) |
| WARNING | `components/SplashScreenEditor.tsx` | No "undo" path after applying a preset | Add a confirm dialog before applying a preset, or store prior splash state in `useState` for last-action undo |
| INFO | `components/InteractiveObjectsEditor.tsx:124` | `▲`/`▼` Unicode toggles not wired with `accessibilityLabel` for the toggle action | Add `accessibilityRole="button"` + `accessibilityLabel={t('editor.expandCollapse')}` + `accessibilityState={{ expanded }}` |

---

## 4. Findings by File

| File | P1 | P2 | P3 | P4 | P5 | P6 | Worst |
|------|----|----|----|----|----|----|-------|
| `lib/story-reader-platform.ts` | – | – | CRITICAL (×2) | – | – | – | CRITICAL |
| `lib/engine/types.ts` | – | – | INFO (×12) | – | – | – | INFO |
| `app/preview.tsx` | WARNING (×2) | – | – | – | – | WARNING (×2) | WARNING |
| `app/_layout.tsx` | – | – | – | – | – | clean | clean |
| `app/editor.tsx` | clean | clean | clean | clean | clean | clean | clean |
| `app/tabs/_layout.tsx` | – | – | – | – | – | – | clean (9 LOC) |
| `components/SplashScreenEditor.tsx` | WARNING (×1) | CRITICAL (×3) | – | INFO | INFO | WARNING | CRITICAL |
| `components/InteractiveObjectsEditor.tsx` | – | CRITICAL (×2) | – | INFO | INFO | INFO | CRITICAL |
| `components/editor/PreviewScreen.tsx` | – | CRITICAL (×1) | – | – | – | – | CRITICAL |
| `components/editor/SceneSelector.tsx` | – | CRITICAL (×2) | – | – | – | – | CRITICAL |
| `components/editor/SceneComposerPhone.tsx` | – | WARNING (×2) | – | – | – | WARNING (×1) | WARNING |
| `components/editor/manuscript/StoryManuscriptBlock.tsx` | – | – | CRITICAL (×1) | – | – | – | CRITICAL |
| `components/editor/manuscript/StoryManuscriptSidebar.tsx` | – | – | CRITICAL (×1) | – | – | – | CRITICAL |
| `components/document-editor/DocumentSceneSidebar.tsx` | – | – | CRITICAL (×1) | WARNING (×3) | WARNING (×6) | – | CRITICAL |
| `components/document-editor/DocumentBlockDialogue.tsx` | WARNING (×2) | – | CRITICAL (×2) | – | – | – | CRITICAL |
| `components/document-editor/DocumentBlockChoice.tsx` | WARNING (×4) | – | – | – | – | – | WARNING |
| `components/document-editor/DocumentCommandMenu.tsx` | – | – | CRITICAL (×1) | – | – | – | CRITICAL |
| `components/document-editor/DocumentChip.tsx` | – | – | CRITICAL (×2) | – | – | – | CRITICAL |
| `components/document-editor/DocumentPage.tsx` | WARNING (×3) | – | – | WARNING (×1) | WARNING (×7) | – | WARNING |
| `components/document-editor/DocumentEditorHeader.tsx` | – | – | – | WARNING (×4) | WARNING (×6) | – | WARNING |
| `components/document-editor/DocumentTechnicalPropertiesPanel.tsx` | – | – | – | WARNING (×3) | WARNING (×5) | – | WARNING |
| `components/editor/properties/panel-chrome.tsx` | WARNING (×3) | – | – | – | – | – | WARNING |
| `components/editor/properties/asset-field.tsx` | WARNING (×2) | – | – | – | – | – | WARNING |
| `components/editor/MiniPreview.tsx` | WARNING (×1) | – | – | – | – | – | WARNING |
| `components/editor/TimelinePanel.tsx` | – | – | WARNING (×1) | – | – | – | WARNING |
| `components/reader/ReaderControls.tsx` | WARNING (×3) | – | – | – | – | – | WARNING |
| `components/story-reader-responsive.tsx` | WARNING (×1) | – | – | – | – | – | WARNING |
| `components/LanguageSelector.tsx` | – | clean | – | – | – | – | clean |
| `components/ReaderMenu.tsx` | – | clean | – | – | – | – | clean |
| `components/WebSidebar.tsx` | – | clean | – | – | – | – | clean |
| `components/WebTopBar.tsx` | – | clean | – | – | – | – | clean |
| `components/dialogue-history.tsx` | – | clean | – | – | – | – | clean |
| `components/ErrorBoundary.tsx` | – | – | – | – | – | clean | clean |
| `components/ui/Button.tsx` | – | clean | – | – | – | – | clean |
| `components/ui/ConfirmDialog.tsx` | – | clean | – | – | – | – | clean |
| `components/ui/Toast.tsx` | – | clean | – | – | – | – | clean |
| `components/ui/icon-symbol.tsx` | – | INFO (mapping gap) | – | – | – | – | INFO |
| `components/screen-container.tsx` | – | – | – | – | – | clean | clean |
| `app/editor.tsx`, `app/settings.tsx`, `app/tabs/index.tsx`, `app/reader.tsx`, `app/save-load.tsx` | – | – | – | – | – | – | clean |

---

## 5. P0 Violations (UI-SPEC §P0)

UI-SPEC §P0 requires:
- No emoji as primary command/nav/destructive/status icon
- All copy via `t()` (i18n mandatory)
- No `flex: 1` outside the root, no magic spacing outside the scale, etc.
- No `withAlpha` hack; use `withAlpha()` helper

**P0 violations found:**

| # | Rule | Files | Count |
|---|------|-------|-------|
| 1 | No emoji-as-control | `SplashScreenEditor.tsx:122,372`, `InteractiveObjectsEditor.tsx:124`, `PreviewScreen.tsx:280`, `SceneSelector.tsx:390,518` | 6 sites |
| 2 | All copy via `t()` | `app/preview.tsx:18,26`, `SplashScreenEditor.tsx:387`, `MiniPreview.tsx:170`, `story-reader-responsive.tsx:270`, `ReaderControls.tsx:89,96,119`, `panel-chrome.tsx:55,91,105`, `asset-field.tsx:36,39`, `DocumentBlockChoice.tsx:66,67,93,94`, `DocumentBlockDialogue.tsx:110,136`, `DocumentPage.tsx:138,219,270` | 21 sites |
| 3 | No hex+alpha string concat; use `withAlpha()` | `lib/story-reader-platform.ts:7,17` (`'#000000'`/`'#ffffff'`), `DocumentSceneSidebar.tsx:30`, `DocumentBlockDialogue.tsx:97-98`, `DocumentCommandMenu.tsx:104`, `DocumentChip.tsx:35-36`, `StoryManuscriptBlock.tsx:303`, `StoryManuscriptSidebar.tsx:57`, `TimelinePanel.tsx:169` (`'#000'`) | 9 sites |
| 4 | No hardcoded color literals | `lib/engine/types.ts:70-81` (12 hex block-category colors) | 1 site, 12 literals |

---

## 6. Regression Analysis vs. UI-REVIEW.md (2026-05-28, 15/24)

| Original finding (May 28) | Status | Evidence |
|---------------------------|--------|----------|
| **Copy 1:** `manuscript.dialogue` translation key missing in EN/UK | **FIXED** | `lib/translations.ts` — key present in both EN and UK |
| **Copy 2:** Some accessibility labels not localized | **PARTIAL** | New findings in `document-editor/` subtree; old `properties/` files also still have hardcoded a11y hints (panel-chrome, asset-field). Regressed on a11y coverage. |
| **Visuals 1:** IconSymbol use inconsistent | **PARTIAL** | Improved in `app/`, `WebSidebar`, `WebTopBar`, `SceneComposerPhone`, `DocumentEditorHeader`. But 4 new files (`SplashScreenEditor`, `InteractiveObjectsEditor`, `PreviewScreen`, `SceneSelector`) use Unicode glyphs because `IconSymbol` MAPPING is missing icons. |
| **Color 1:** Hex+alpha in some places | **REGRESSED** | May 28 was 2 sites. Now 9 sites — `document-editor/` subtree and `manuscript/` re-introduced the pattern after M2 was supposed to retire it. |
| **Color 2:** `'#000'` shadowColor | **NOT FIXED** | `TimelinePanel.tsx:169` still present |
| **Typography 1:** Inline fontSize values | **REGRESSED** | May 28 was a few sites. Now ~10 sites — `document-editor/` subtree wrote its own inline fontSize values, bypassing `typeScale`. |
| **Typography 2:** `typeScale` defined but underused | **PARTIAL** | `app/editor.tsx` and 4 app routes use `typeScale.*` correctly; `document-editor/` subtree does not import it. |
| **Spacing 1:** Magic values | **REGRESSED** | `document-editor/` subtree uses 10, 11, 14, 18, 42, 76, 1 — none of which are in `spacing: {xs: 4, sm: 8, md: 12, lg: 16, xl: 24, 2xl: 32, 3xl: 48}`. |
| **Spacing 2:** `borderRadius: 8` literal | **REGRESSED** | `DocumentSceneSidebar.tsx:27` — same pattern. Should be `radius.md`. |
| **Experience 1:** Error boundary present | **FIXED** | Confirmed in `app/_layout.tsx:38` |
| **Experience 2:** Confirm dialogs | **MAINTAINED** | `SceneComposerPhone` uses `ConfirmDialog destructive` |
| **Experience 3:** Tap-twice to delete text blocks | **MAINTAINED** | `useBlockOperations.handleEmptyBackspace` |
| **Experience 4:** Loading states | **REGRESSED** | `app/preview.tsx:18,26` use plain `<Text>Loading...</Text>` and `<Text>No story or scene ID provided</Text>` — no spinner, no error toast, no recovery action |

**Net regression: -2 points (15 → 13).** The `document-editor/` subtree (Phase 13 work) introduced 4+ new P0 violations in each of pillars 3, 4, 5 — the largest single-source regression in the codebase.

### vs. audit-2026-06-04.md (UX 6.5/10, 4 days ago)

| UX finding (Jun 4 morning) | Status |
|-----------------------------|--------|
| **UX-1:** Hardcoded English in SplashScreenEditor | **CONFIRMED, NOT FIXED** — `SplashScreenEditor.tsx:387` still present |
| **UX-2:** Missing undo on splash apply | **CONFIRMED, NOT FIXED** |
| **UX-3:** Hex+alpha in manuscript | **CONFIRMED, NOT FIXED** — also expanded to document-editor |
| **UX-4:** Inline fontSize in document-editor | **CONFIRMED, NOT FIXED** — 6+ new sites |
| **UX-5:** Unicode glyphs in InteractiveObjectsEditor | **CONFIRMED, NOT FIXED** |
| **UX-6:** Hardcoded `Loading...` in MiniPreview | **CONFIRMED, NOT FIXED** — also present in `app/preview.tsx` |

The Jun 4 audit correctly identified 6 of the 6 issues. None have been remediated. This audit adds 8 more file-level issues and a system-level finding (Color pillar is now 1/4, was 2/4 in May 28).

---

## 7. Top Priority Remediations

Ordered by severity × reach × effort.

### P0.1 — Color: replace all `` `${color}NN` `` with `withAlpha()` [CRITICAL, S, 6 files]
- Effort: ~1 hour (mechanical replacement)
- Files: `lib/story-reader-platform.ts:7,17`, `DocumentSceneSidebar.tsx:30`, `DocumentBlockDialogue.tsx:97-98`, `DocumentCommandMenu.tsx:104`, `DocumentChip.tsx:35-36`, `StoryManuscriptBlock.tsx:303`, `StoryManuscriptSidebar.tsx:57`
- Migration:
  ```ts
  // Before
  backgroundColor: `${colors.primary}14`
  // After
  import { withAlpha } from '@/lib/_core/theme';
  backgroundColor: withAlpha(colors.primary, 0.08)
  ```
- For `lib/story-reader-platform.ts`, define `null`/transparent as the new fallback contract; consumers must pass `colors` explicitly.

### P0.2 — Visual: extend `IconSymbol` MAPPING and replace Unicode glyphs [CRITICAL, S, 5 files]
- Effort: ~1.5 hours
- Add to `MAPPING` in `components/ui/icon-symbol.tsx`:
  - `chevron.up` → `chevron.up`
  - `chevron.down` → `chevron.down`
  - `arrow.left` → `arrow.left`
  - `arrow.right` → `arrow.right`
  - `xmark` → `xmark`
  - `checkmark` / `check` → `checkmark` (note: avoid name collision with existing `check`)
  - `plus.circle` → `plus.circle.fill`
  - `minus` → `minus`
  - `square.and.arrow.up` → `square.and.arrow.up`
- Replace in: `SplashScreenEditor.tsx:122,372`, `InteractiveObjectsEditor.tsx:124`, `PreviewScreen.tsx:280`, `SceneSelector.tsx:390,518`, `SceneComposerPhone.tsx:191` (remove the 180° rotate hack — use `chevron.left` directly).

### P0.3 — Copy: localize all hardcoded English a11y strings [CRITICAL, M, 10 files]
- Effort: ~3 hours
- Add translation keys to `lib/translations.ts` for `en` and `uk`:
  - `common.loading`, `common.noRouteProvided`
  - `splash.configured`, `splash.status`
  - `reader.continueHint`, `reader.hints.back`, `reader.hints.menu`, `reader.hints.save`
  - `editor.properties.closeHint`, `editor.properties.duplicateHint`, `editor.properties.deleteHint`, `editor.properties.assetFieldHint`
  - `editor.selectX` (with category interpolation)
  - `document.choice.addOption`, `document.choice.removeOption`, `document.choice.editOption`, `document.choice.moveOption`
  - `document.dialogue.characterHint`, `document.dialogue.lineHint`
  - `document.a11y.sceneTitle`, `document.a11y.narration`, `document.a11y.slashCommandInput`
- Replace in: 10 files listed in Pillar 1 findings.

### P1.1 — Typography: replace inline `fontSize` in `document-editor/` [WARNING, S, 5 files]
- Effort: ~1.5 hours
- Add to `lib/design-tokens.ts`:
  - `typeScale.documentTitle: { fontSize: 36, lineHeight: 42 }` (or repurpose pageTitle)
  - `typeScale.propertiesTitle: { fontSize: 18, lineHeight: 24 }`
  - `typeScale.headerSubtitle: { fontSize: 16, lineHeight: 22 }` (only if needed)
- Replace in: `DocumentPage.tsx:136`, `DocumentEditorHeader.tsx:66,70,85`, `DocumentSceneSidebar.tsx:20,35,36`, `DocumentTechnicalPropertiesPanel.tsx:50,365,366`.

### P1.2 — Spacing: tokenize `document-editor/` [WARNING, S, 5 files]
- Effort: ~1 hour
- Add to `lib/design-tokens.ts`:
  - `headerHeight.phone: 76`
  - `headerHeight.desktop: 56`
- Replace in: `DocumentSceneSidebar.tsx:19,21,27,32,33,36`, `DocumentPage.tsx:108,120,121,122,213,226,266`, `DocumentEditorHeader.tsx:40,41,42,43,49`, `DocumentTechnicalPropertiesPanel.tsx:47,48,49,363,365,366`.

### P1.3 — Experience: fix `app/preview.tsx` dead-end error state [WARNING, XS, 1 file]
- Effort: ~15 min
- Replace `<Text>Loading...</Text>` with `<ActivityIndicator size="large"/>` + `<Text>{t('common.loading')}</Text>`.
- Replace `<Text>No story or scene ID provided</Text>` with `t('document.invalidRoute')` + `<Button onPress={() => router.back()}>{t('common.back')}</Button>` to give the user a recovery action.

### P1.4 — Experience: deduplicate `t('editor.blocks')` in SceneComposerPhone [WARNING, XS, 1 file]
- Effort: ~5 min
- Remove the header pill at `SceneComposerPhone.tsx:209` (keep the tab at `:247`).

### P2.1 — Spec/code: resolve 2-locale vs 3-locale drift [INFO, S]
- Effort: ~30 min discussion
- UI-SPEC says EN/UK/PL. Code has 2 locales. Decide: update spec to 2 locales (faster), or restore PL translations (slower but spec-correct).

---

## 8. Files Audited

### `app/` (3 routes)
- `app/editor.tsx` — clean
- `app/document-editor.tsx` — clean
- `app/preview.tsx` — 2 hardcoded English (Loading, NoRoute), no error recovery
- `app/_layout.tsx` — clean (ErrorBoundary, ToastViewport, ThemeProvider, guards wired)
- `app/tabs/_layout.tsx` — clean (9 LOC)

### `components/` (24 components)
- `components/SplashScreenEditor.tsx` — Unicode glyphs × 3, hardcoded status string
- `components/InteractiveObjectsEditor.tsx` — Unicode glyphs × 2
- `components/story-reader-responsive.tsx` — hardcoded a11y hint × 1
- `components/editor/SceneComposer.tsx` — clean
- `components/editor/SceneComposerPhone.tsx` — duplicate `t('editor.blocks')` × 2; rotated chevron hack
- `components/editor/SceneSelector.tsx` — Unicode glyphs × 2
- `components/editor/SceneManager.tsx` — clean
- `components/editor/PreviewScreen.tsx` — Unicode `←` glyph × 1
- `components/editor/MiniPreview.tsx` — hardcoded `"Loading..."` × 1
- `components/editor/TimelinePanel.tsx` — `'#000'` shadowColor × 1
- `components/editor/PropertiesPanel.tsx` — clean
- `components/editor/manuscript/StoryManuscriptBlock.tsx` — hex+alpha × 1
- `components/editor/manuscript/StoryManuscriptSidebar.tsx` — hex+alpha × 1
- `components/editor/properties/panel-chrome.tsx` — hardcoded a11y hints × 3
- `components/editor/properties/asset-field.tsx` — hardcoded placeholder, a11y hint × 2
- `components/document-editor/DocumentSceneEditor.tsx` — clean
- `components/document-editor/DocumentPage.tsx` — hardcoded a11y × 3, fontSize 36, magic spacing
- `components/document-editor/DocumentSceneSidebar.tsx` — hex+alpha × 1, inline fontSize × 3, magic spacing × 6
- `components/document-editor/DocumentEditorHeader.tsx` — inline fontSize × 4, magic spacing × 6
- `components/document-editor/DocumentBlockDialogue.tsx` — hex+alpha × 2, hardcoded a11y × 2
- `components/document-editor/DocumentBlockChoice.tsx` — hardcoded a11y × 4
- `components/document-editor/DocumentCommandMenu.tsx` — hex+alpha × 1
- `components/document-editor/DocumentChip.tsx` — hex+alpha × 2
- `components/document-editor/DocumentTechnicalPropertiesPanel.tsx` — inline fontSize × 3, magic spacing × 5
- `components/reader/ReaderControls.tsx` — hardcoded a11y × 3
- `components/LanguageSelector.tsx` — clean
- `components/ReaderMenu.tsx` — clean
- `components/WebSidebar.tsx` — clean
- `components/WebTopBar.tsx` — clean
- `components/dialogue-history.tsx` — clean
- `components/ErrorBoundary.tsx` — clean
- `components/screen-container.tsx` — clean
- `components/ui/Button.tsx` — clean
- `components/ui/ConfirmDialog.tsx` — clean
- `components/ui/Toast.tsx` — clean
- `components/ui/icon-symbol.tsx` — MAPPING gap (root cause of Unicode glyph violations)

### `lib/` (6 contracts)
- `lib/_core/theme.ts` — `withAlpha()` helper present, correct
- `lib/design-tokens.ts` — `typeScale`, `spacing`, `radius` defined; missing: `headerHeight.*`, `typeScale.documentTitle`, `typeScale.propertiesTitle`
- `lib/translations.ts` — `manuscript.dialogue` present in both EN/UK (regression fixed); 2-locale vs 3-locale spec drift
- `lib/i18n.ts` — `useI18n`, `t()` API working
- `lib/story-reader-platform.ts` — **CRITICAL: `'#000000'` and `'#ffffff'` hardcoded fallbacks**
- `lib/engine/types.ts` — 12 hex block-category colors (INFO)

**Total: 38 .tsx files + 6 lib contracts + 3 app routes = 47 files audited.**

---

## Appendix A: Audit Method

- 6-pillar scoring per gsd-ui-review skill spec.
- Read all `app/`, `components/`, `components/ui/`, `components/editor/`, `components/editor/manuscript/`, `components/editor/properties/`, `components/document-editor/`, `components/reader/` files relevant to Phase 13 (document-editor) and adjacent editor work.
- Grepped for: `fontSize: [0-9]`, `borderRadius: [0-9]`, `padding: [0-9]`, `marginBottom: [0-9]`, `accessibilityHint=\"[A-Z]`, `\`\${colors\.`, `withAlpha(`, `IconSymbol`, `'#`, `t\('`, `fontSize=\\\\\\\".
- Compared to UI-SPEC.md §P0, §Pillar 1-6, §Localization.
- Cross-checked against UI-REVIEW.md (May 28) and audit-2026-06-04.md (Jun 4 morning).

## Appendix B: Notes for Next Audit

- The `document-editor/` subtree is the largest single source of regressions. Phase 13 plans should include a post-merge UI lint to enforce `typeScale`/`spacing`/`radius` token usage.
- Consider adding an ESLint rule or custom script:
  ```bash
  # Block hex+alpha string-concat outside of lib/_core/theme.ts
  grep -rn '\${colors\.[a-z0-9_]*}[0-9a-fA-F]\{2\}' components/ app/ --include='*.tsx' --include='*.ts' | grep -v 'lib/_core/theme'
  # Should return 0 matches after fix.
  ```
- Consider adding a Prettier rule or codemod to migrate `fontSize: 11/12/14/16/17/18/20/32/36` → `...typeScale.micro/caption/label/body/...sectionTitle/pageTitle`.
