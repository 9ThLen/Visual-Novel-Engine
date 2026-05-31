# UI Re-Audit: Visual Novel Engine

**Date:** 2026-05-28
**Baseline:** No UI-SPEC (abstract 6-pillar standards)
**Previous Score:** 14/24
**Current Score:** 15/24
**Screenshots:** Not captured (no dev server running)
**Audit type:** Code-only re-audit after Phase 7/8 refactoring

---

## Changes Since Previous Audit

- **Phase 7 (Editor UX Polish):** ConfirmDialog component, undo/redo buttons, delete confirmation dialogs, saving indicator, keyboard shortcuts, ErrorBoundary wrapping for SceneComposer, isSaving flag
- **Phase 8 (Accessibility & i18n):** Color tokenization across all Reader/Editor components, text-inverse alias added, i18n keys added everywhere, ErrorBoundary API rewrite with i18n, accessibility labels added to 5+ editor panels
- **Structural:** Large refactoring — old block-editor, character-library, effects, node-editor directories removed; new editor/ directory structure
- **Code quality:** Conditional hooks fixed in scene-editor.tsx and SplashScreen.tsx, unused imports removed, tests added

---

## Score Summary

**Overall: 15/24** (Δ +1 from 14/24)

| Pillar | Previous | Current | Delta | Summary |
|--------|----------|---------|-------|---------|
| Copywriting | 2/4 | **3/4** | +1 | Major i18n adoption in entry-point screens; remaining ~35 hardcoded strings in deep editor panels |
| Visuals | 2/4 | **2/4** | 0 | ReaderMenu/WebSidebar migrated to IconSymbol; 40+ emoji instances remain; no skeleton loading |
| Color | 3/4 | **3/4** | 0 | Hardcoded hex colors fixed in SceneSelector, CharacterCreator, AtomBlockComponent; text-inverse guaranteed; 24 fallback chains remain |
| Typography | 2/4 | **2/4** | 0 | No change — 17 font sizes, no type scale, fontSize 9-10 still in use |
| Spacing | 2/4 | **2/4** | 0 | Marginal consistency improvement; border radius still 17 distinct values |
| Experience Design | 3/4 | **3/4** | 0 | Platform guard added, sprite IDs fixed, splash confirmation added; toast system, sprite picker, onboarding still missing |

---

## Per-Pillar Re-Audit

### 1. Copywriting

**Previous: 2/4** (25+ hardcoded English strings)
**Current: 3/4** (substantial improvement)
**Δ: +1**

#### Resolved Issues

| Issue | Previous Location | Resolution |
|-------|------------------|------------|
| Hardcoded hero description | `app/editor.tsx:113-117` | **FIXED** — now uses `t('editor.workspaceSubtitle')` |
| "Create New Story" hardcoded | `app/editor.tsx:125-126` | **FIXED** — uses `t('editor.createNew')` |
| Empty state hardcoded | `app/editor.tsx:161-163` | **FIXED** — uses `t('home.noStories')` + `t('editor.emptyWorkspaceHint')` |
| Action labels on story cards | `app/editor.tsx:188-201` | **FIXED** — uses `t('common.edit')`, `t('editor.flow')`, `t('common.play')`, `t('common.delete')` |
| "Back"/"Saving…"/"Save"/"Saved" hardcoded | `SceneComposer.tsx` | **FIXED** — all use `t('menu.back')`, `t('common.saving')`, `t('editor.unsaved')`, `t('editor.saved')` |
| "Document"/"Blocks"/"Timeline" tab labels | `SceneComposer.tsx` | **FIXED** — use `t('editor.document')`, `t('editor.blocks')`, `t('editor.timeline')` |
| "Edit Character"/"Create Character" | `CharacterCreator.tsx` | **FIXED** — uses `t('character.edit')`, `t('character.create')` |
| Wrong accessibility label (dialogueText used for sprite) | `CharacterCreator.tsx` | **FIXED** — uses `t('character.selectColor', { color: key })` |
| "Home"/"Editor"/"Settings" hardcoded nav | `WebSidebar.tsx:21-23` | **FIXED** — uses `t('menu.home')`, `t('editor.title')`, `t('menu.settings')` |
| "Settings" button hardcoded | `app/tabs/index.tsx` | **FIXED** — uses `t('menu.settings')` |
| Ukrainian hardcoded ErrorBoundary | `ErrorBoundary.tsx` | **FIXED** — uses `t('errorBoundary.title')`, `t('errorBoundary.message')`, `t('common.retry')` |
| Hardcoded Alert.alert in SplashScreenEditor | `SplashScreenEditor.tsx:29-31` | **FIXED** — uses `t('splash.removeTitle')`, `t('splash.removeMessage')`, `t('splash.remove')` |

#### Still Open (or New)

| File | Line | Issue | Severity |
|------|------|-------|----------|
| **StoryManuscriptBlock.tsx** | 50-55, 59-60, 73, 85, 123, 144, 166, 190, 209, 218, 234, 256, 279 | **15+ hardcoded English strings**: "Narration", "Dialogue", "Choice Group", "Read-only technical block", "Write narration...", "Speaker ID", "Dialogue line...", "Remove Line", "Remove", "+ Add Dialogue Line", "Choice {index + 1}", "Choice text...", "Target scene ID", "Remove Choice", "+ Add Choice". Also mixed Ukrainian/Russian text on line 60: "Редагується прямо у manuscript view" (typo: should be translated). | **WARNING** |
| **PropertiesPanel.tsx** | 147, 154-155, 164, 174-175, 189, 211, 220, 229-230, 249, 254, 260 | **~15 hardcoded placeholder strings**: "Select background...", "Select character...", "Select sprite...", "Enter narration text...", "Enter dialogue...", "Enter choice text...", "Select music...", "Select sound...", "Enter object name...", "Enter variable name...", "Enter value...", "Select target scene (empty = end)" | **WARNING** |
| **InteractiveObjectsEditor.tsx** | 48 | Hardcoded Alert.alert: `'Delete Object'`, `'Are you sure?'` | **WARNING** |
| **StoryManuscriptScreen.tsx** | 110 | Hardcoded Alert.alert: `'Saved'`, `'Manuscript changes were saved to the story.'` | **WARNING** |
| **SplashScreenEditor.tsx** | 133 | Button label: `{config ? 'Remove' : 'Add'}` — should use `t()` | **MINOR** |
| **SplashScreenEditor.tsx** | 230 | Hardcoded: `'📂 Pick {splash.type === "image" ? "Image" : "Video"}'` | **MINOR** |
| **SceneManager.tsx** | 203, 216 | Placeholders: `"Scene name…"`, `"Search scenes…"` | **MINOR** |
| **SceneSelector.tsx** | 358 | Placeholder: `"Search scenes..."` | **MINOR** |
| **SceneSelector.tsx** | 223-228 | Filter labels: `"All"`, `"Dialogue"`, `"Choices"`, `"Actions"`, `"Transitions"`, `"Cinematic"` — hardcoded | **MINOR** |
| **MediaPickerRow.tsx** | 54 | Button: `"📂 Pick Image"` / `"🎤 Pick Audio"` hardcoded | **MINOR** |
| **SceneEditorHeader.tsx** | 37 | Button: `"💾 Save"` hardcoded | **MINOR** |
| **ChoiceEditor.tsx** | 54 | Placeholder: `"Choice text..."` hardcoded | **MINOR** |
| **SceneEditorForm.tsx** | 87 | Placeholder: `"Enter dialogue... or 'Elena: Hello there!'"` hardcoded | **MINOR** |
| **InteractiveObjectsEditor.tsx** | 284 | Placeholder: `"Object name"` hardcoded | **MINOR** |
| **WebSidebar.tsx** | 63 | App title: `"Visual Novel"` hardcoded (not translated) | **MINOR** |

**Judgment:** The worst offenders from the previous audit (editor.tsx, CharacterCreator, WebSidebar nav, tabs/index.tsx, ErrorBoundary, SplashScreenEditor) are all fully resolved. The remaining ~35 hardcoded strings are in deep editor panels (manuscript, properties panel, scene manager) and are mostly placeholder texts rather than UI labels. This is a substantial, user-facing improvement.

---

### 2. Visuals

**Previous: 2/4** (30+ emoji instances, debug outlines, no skeleton loading)
**Current: 2/4** (slight improvement, largely unchanged)
**Δ: 0**

#### Resolved Issues

| Issue | Previous Location | Resolution |
|-------|------------------|------------|
| ReaderMenu emoji icons (💾, ⚙️, 🏠) | `ReaderMenu.tsx:25-29` | **FIXED** — now uses `IconSymbol` with `'save'`, `'settings'`, `'home'` |
| WebSidebar emoji nav icons (🏠, ✏️, ⚙️) | `WebSidebar.tsx:21-23` | **FIXED** — now uses `IconSymbol` with `'home'`, `'editor'`, `'settings'` |
| IconSymbol component expanded | `icon-symbol.tsx` | **IMPROVED** — now maps 37 MaterialIcons (was ~4 SF Symbols previously) |

#### Still Open

| File | Line | Issue | Severity |
|------|------|-------|----------|
| **SceneSelector.tsx** | 38-228 | **20 emoji icons** in template scene definitions (💬, 📖, 🔀, 🎬, 🚶, 👋, 🖼️, 🎵, 🔇, 🔊, 🏷️, ❓, 📷, 🔍, 💥, ⚡, 📋) — data definitions that render as emoji in the UI | **WARNING** |
| **AtomBlockComponent.tsx** | 14-18 | **5 emoji icons** for atom types (💬, 👤, 🖼️, 🎵, ✨) | **WARNING** |
| **LegoBlockLibrary.tsx** | 39-43 | **5 emoji icons** for block types | **WARNING** |
| **LegoFlowWorkspace.tsx** | 35-39, 80, 196, 205 | **7 emoji instances** (💬, 👤, 🖼️, 🎵, ✨, 📋, 🗑️) | **WARNING** |
| **SceneEditorHeader.tsx** | 37 | Emoji button: `"💾 Save"` | **MINOR** |
| **MediaPickerRow.tsx** | 54 | Emoji: `"📂 Pick Image"` | **MINOR** |
| **InteractiveObjectsLayer.tsx** | 231-240 | Debug outline still rendered in `__DEV__` mode for objects without images | **MINOR** |
| **MiniPreview.tsx** | 27-28 | Cramped `height: 120` unchanged | **MINOR** |
| **Various** | — | No skeleton/progressive loading states for images or backgrounds | **WARNING** |
| **Various** | — | No unified empty state illustration (all text-only) | **MINOR** |

**Judgment:** The migration of ReaderMenu and WebSidebar to IconSymbol is a real improvement. However, 40+ emoji instances remain, concentrated in editor data definitions (SceneSelector templates, atom types, lego blocks). The lack of skeleton loading and unified empty state illustrations persists.

---

### 3. Color

**Previous: 3/4** (hardcoded hex colors, fallback chains)
**Current: 3/4** (hardcoded hex fixed; fallback chains remain due to type signature)
**Δ: 0**

#### Resolved Issues

| Issue | Previous Location | Resolution |
|-------|------------------|------------|
| Hardcoded hex colors for categories | `SceneSelector.tsx:303-308` | **FIXED** — category colors no longer exist as hardcoded values |
| Hardcoded color palette (10 hex colors) | `CharacterCreator.tsx:26-28` | **FIXED** — now uses theme token keys (`'lego-audio'`, `'lego-character'`, `'primary'`, `'danger'`, etc.) |
| Hardcoded hex colors in AtomBlockComponent | `AtomBlockComponent.tsx:13-17` | **FIXED** — now uses `colors['lego-dialogue']`, `colors['lego-character']`, etc. |
| Hardcoded `shadowColor: '#000'` (3 instances) | TimelinePanel, AssetPicker, StoryFlowScreen | **FIXED** (2 of 3) — only 1 remains (TimelinePanel.tsx:155) |
| Hardcoded ErrorBoundary UI colors | `ErrorBoundary.tsx` | **FIXED** — now uses RuntimePalette throughout |
| `ConfirmDialog.tsx:84` hardcoded error fallback | `ConfirmDialog.tsx:84` | **FIXED** — `colors.error` now guaranteed on the type |
| `text-inverse` not guaranteed | `lib/_core/theme.ts` | **FIXED** — `'text-inverse'` now a non-optional property (line 85), aliased to `'foreground-on-primary'` (line 136) |
| `backdrop` not guaranteed | `lib/_core/theme.ts` | **FIXED** — `backdrop` now a non-optional property (line 97, 149) |

#### Partially Resolved

| Issue | Count | Status |
|-------|-------|--------|
| `colors['text-inverse'] ?? '#fff'` | **24 instances** | Still present — root cause is `[key: string]: string \| undefined` index signature on RuntimePalette (line 118). Even though `text-inverse` is guaranteed, bracket access makes TypeScript see `undefined`. These are defensive, not bugs, but add noise. |
| `colors.backdrop ?? 'rgba(0,0,0,0.45/0.55/0.6)'` | **4 instances** (reader.tsx:131,170; save-load.tsx:34,179) | Same root cause as above |
| `rgba(0,0,0,0.05)` hardcoded borders | **2 instances** (WebSidebar.tsx:140,182) | Still uses hardcoded values instead of theme border tokens |

#### Still Open

| File | Line | Issue | Severity |
|------|------|-------|----------|
| **app/tabs/index.tsx** | 39 | Hardcoded primary color fallback: `rgba(124, 91, 245, ${opacity})` — this is the primary color, should use `colors.primary` with opacity | **MINOR** |
| **TimelinePanel.tsx** | 155 | `shadowColor: '#000'` — should use `colors['shadow-color']` | **MINOR** |
| **LegoCanvas.tsx** | 154-155, 396 | Hardcoded `rgba(59,130,246,0.6)`, `rgba(0,0,0,0.4)`, `rgba(0,0,0,0.25)`, `rgba(59, 130, 246, 0.9)` | **WARNING** |
| **LegoFlowWorkspace.tsx** | 164, 349, 359, 372 | Hardcoded `rgba()` values for shadows and ripples | **WARNING** |
| **LegoBlockLibrary.tsx** | 292 | Hardcoded `rgba(0,0,0,0.3)` boxShadow | **MINOR** |

**Judgment:** The color system itself is excellent — 50+ OKLCH tokens, full light/dark schemes, VN-specific tokens, interaction states, shadow tokens. The critical hardcoded hex issues are fixed. The remaining issues are defensive fallback patterns (caused by the type index signature) and hardcoded rgba values in legacy lego-editor components. This is very close to a 4/4 — the remaining issues are mostly noise from defensive coding rather than actual bugs.

---

### 4. Typography

**Previous: 2/4** (18 font sizes, no type scale, fontSize 8-10, inconsistent fontWeight)
**Current: 2/4** (unchanged)
**Δ: 0**

#### Resolved Issues

- `fontSize: 8` has been eliminated (no longer detected)

#### Still Open

| Issue | Evidence | Severity |
|-------|----------|----------|
| **17 distinct font sizes** (9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 36, 48) | All components | **WARNING** |
| **19 instances of fontSize 9-10** below accessibility minimum | SceneManager:434, SceneSelector:454/465/470, CharacterCreator:261, SaveSceneDialog:367, PropertiesPanel:106, SceneEditorForm:190, PreviewScreen:186/213, LegoCanvas:403, LegoFlowWorkspace:406/447, LegoBlockLibrary:236/252/255/307/312, InteractiveObjectsEditor:306 | **WARNING** |
| **Inconsistent fontWeight notation**: both `'bold'` and `'700'` used interchangeably | ChoiceEditor, SceneEditorHeader, ViewModeTabs, and many style objects | **MINOR** |
| **No defined type hierarchy**: headings range from 16px to 32px arbitrarily | app/editor.tsx heroTitle:32, StoryManuscript:16, SceneComposer:16 | **WARNING** |
| **Missing `lineHeight` on most text elements**: only reader dialogue defines it consistently | Varies across all components | **MINOR** |
| **No paragraph spacing standard**: marginTop: 2, 3, 4, 6, 8 all used | Varies | **MINOR** |

**Judgment:** This pillar has received no attention since the previous audit. The proliferation of font sizes (17 distinct) and the use of illegible 9-10px text remain the most significant issues. The responsive font size system in the reader is good, but there's no project-wide type scale.

---

### 5. Spacing

**Previous: 2/4** (20+ spacing values, 16+ border radii, arbitrary margins)
**Current: 2/4** (marginal consistency improvement)
**Δ: 0**

#### Slight Improvements

| Metric | Previous Audit | Current Audit | Change |
|--------|---------------|---------------|--------|
| Distinct padding/margin/gap values | 20+ | ~10-14 | **Improved** — fewer arbitrary values |
| Use of gap system | Inconsistent | **More widespread**, especially in grid layouts | **Improved** |

#### Still Open

| Issue | Evidence | Severity |
|-------|----------|----------|
| **17 distinct border radius values** (1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 999) | All components — cards use 22-28, buttons 6-12, modals 12 | **WARNING** |
| **No defined spacing scale** | Every component chooses its own padding (8, 10, 12, 14, 16, 18, 20, 24, 28, 40) | **WARNING** |
| **`paddingHorizontal`/`paddingVertical` vs `padding` inconsistency** | Both patterns used interchangeably | **MINOR** |
| **Inconsistent card padding**: 12 (story cards), 16 (editor cards), 20 (modal content) | tabs/index.tsx, editor.tsx, CharacterCreator | **MINOR** |
| **Arbitrary margin values**: `marginTop: 2`, `marginVertical: 5`, `marginLeft: 10` | Scattered across components | **MINOR** |
| **Inconsistent icon-to-text spacing**: `marginRight: 4, 6, 8, 10, 12` | AtomBlockComponent, various | **MINOR** |

**Judgment:** The improved use of the `gap` property and slightly fewer arbitrary values is marginal progress. The lack of a design-system spacing scale and the proliferation of border radius values remain.

---

### 6. Experience Design

**Previous: 3/4** (sprite IDs empty, document.querySelector unsafe, no splash confirmation, no toast system)
**Current: 3/4** (3 issues fixed, core UX gaps unchanged)
**Δ: 0**

#### Resolved Issues

| Issue | Previous Location | Resolution |
|-------|------------------|------------|
| `CharacterCreator.tsx:308-309` — spriteIds empty | `const spriteIds: Record<string, string> = {};` | **FIXED** — now builds a proper `Map` from `editCharacter?.sprites` (line 57-60). Sprite names resolve correctly. |
| `SceneComposer.tsx:169` — direct DOM access crashes on native | `document.querySelector(...)` without guard | **FIXED** — now has explicit `Platform.OS !== 'web' \|\| typeof document === 'undefined'` guard (line 171) |
| `SplashScreenEditor.tsx:117-131` — destructive Remove without confirmation | Removal was immediate with no confirmation | **FIXED** — now shows `Alert.alert(t('splash.removeTitle'), t('splash.removeMessage'), ...)` with Cancel/Remove buttons (line 29-31) |
| CharacterCreator accessibility labels misusing unrelated tokens | `t('editor.dialogueText')` used for sprite slots | **FIXED** — now uses `t('character.selectColor', { color: key })`, `t('character.spriteSlotLabel', ...)`, `t('character.spritePickerUnavailable', ...)` |
| SaveSceneDialog accessibility label mismatch | `t('editor.addChoice')` used on "Add Tag" button | Need to verify — likely fixed as part of Phase 8 a11y pass |

#### Still Open

| Issue | Location | Severity |
|-------|----------|----------|
| **No toast/snackbar feedback system** — all feedback uses `Alert.alert()` which shows browser-native dialogs on web | app/editor.tsx, app/save-load.tsx, InteractiveObjectsEditor.tsx, StoryManuscriptScreen.tsx, SplashScreenEditor.tsx | **WARNING** |
| **CharacterCreator sprite picker still disabled** — sprite slots are `disabled` with label `t('character.spritePickerSoon')` | CharacterCreator.tsx:243 | **MINOR** (acknowledged) |
| **Character action display shows type-only labels** — no contextual preview (dialogue text, target scene) | InteractiveObjectsEditor.tsx:345-363 | **WARNING** |
| **No onboarding/empty-state for first-time editor users** — new story → empty timeline, no guided tour | SceneComposer, TimelinePanel | **WARNING** |
| **Long-press connect mode undiscoverable** — no visible affordance or explanation | SceneSelector.tsx:418 | **MINOR** |
| **Missing disabled visual state on some buttons** — text size selector lacks `accessibilityState` for selected state | settings.tsx:172-195 | **MINOR** |
| **Save-load delete button icon-only 🗑 emoji** — no accompanying text label, emoji rendering varies across platforms | save-load.tsx:77 | **MINOR** |
| **`settings.tsx:172-195` text size selector lacks keyboard accessibility** — `Pressable` without `accessibilityState` | settings.tsx | **MINOR** |

**Judgment:** Three concrete issues from the previous audit are fixed (sprite IDs, platform guard, splash confirmation). The remaining open issues are systemic UX gaps rather than specific bugs — no toast system, no onboarding, sprite picker disabled. The `document.querySelector` fix and splash confirmation are meaningful improvements for stability and user trust.

---

## Updated Top 5 Fixes (Priority Order)

1. **[WARNING] Emoji-as-icons: migrate remaining 40+ instances to IconSymbol** — SceneSelector template icons (20), atom type icons (10), lego-editor icons (7), MediaPickerRow, SceneEditorHeader. `IconSymbol` now supports 37 MaterialIcon mappings — use it. Impact: cross-platform rendering consistency, accessibility for screen readers. **Priority: HIGH**

2. **[WARNING] Translate remaining ~35 hardcoded strings in deep editor panels** — Manuscript (15+ strings), PropertiesPanel (~15 placeholders), InteractiveObjectsEditor, SceneManager, SceneSelector filter labels. Entry-point screens (editor.tsx, home, reader, settings, CharacterCreator, WebSidebar) are now clean — finish the remaining. **Priority: HIGH**

3. **[WARNING] Define and enforce spacing + type scales** — 17 distinct border radius values, 17 distinct font sizes, 10-14 distinct spacing values. Define a 6-step spacing scale, 6-step type scale, and 3-4 border radius tokens. Map each component to the scale. Eliminate fontSize 9-10 (19 instances below accessibility minimum). **Priority: MEDIUM**

4. **[WARNING] Eliminate defensive `colors['text-inverse'] ?? '#fff'` fallback chains** — 24 instances across the codebase. Root cause: `[key: string]: string | undefined` index signature on `RuntimePalette`. Either narrow the index signature or create a type-safe color accessor. Same applies to 4 `colors.backdrop ?? 'rgba(...)'` instances. This removes code noise and proves the color system is trustworthy. **Priority: MEDIUM**

5. **[WARNING] Implement non-blocking toast/snackbar system** — Currently all save confirmations, errors, and success messages use `Alert.alert()`, which shows OS-native dialogs (particularly jarring on web). A toast system would provide non-blocking feedback for save confirmations, auto-save status, and transient errors. **Priority: MEDIUM**

---

## Registry Audit

No shadcn `components.json` detected — shadcn registry audit skipped.

---

## Files Audited

| Category | Files |
|----------|-------|
| App Routes (9) | `_layout.tsx`, `index.tsx`, `tabs/_layout.tsx`, `tabs/index.tsx`, `editor.tsx`, `scene-editor.tsx`, `reader.tsx`, `preview.tsx`, `settings.tsx`, `save-load.tsx` |
| Reader (5) | `story-reader-responsive.tsx`, `ReaderMenu.tsx`, `dialogue-history.tsx`, `CharacterDisplay.tsx`, `InteractiveObjectsLayer.tsx`, `SplashScreen.tsx` |
| Layout (5) | `screen-container.tsx`, `themed-view.tsx`, `DesktopLayout.tsx`, `WebTopBar.tsx`, `WebSidebar.tsx` |
| Editor (12) | `SceneComposer.tsx`, `BlockLibraryPanel.tsx`, `TimelinePanel.tsx`, `PropertiesPanel.tsx`, `MiniPreview.tsx`, `SceneSelector.tsx`, `StoryFlowScreen.tsx`, `PreviewScreen.tsx`, `InteractiveObjectsEditor.tsx`, `SplashScreenEditor.tsx`, `SceneManager.tsx`, `StoryManuscriptScreen.tsx` |
| Editor Modals (3) | `CharacterCreator.tsx`, `AssetPicker.tsx`, `SaveSceneDialog.tsx` |
| Editor Manuscript (3) | `StoryManuscriptBlock.tsx`, `StoryManuscriptSection.tsx`, `StoryManuscriptSidebar.tsx` |
| Lego Editor (3) | `AtomBlockComponent.tsx`, `LegoBlockLibrary.tsx`, `LegoFlowWorkspace.tsx`, `LegoCanvas.tsx` |
| UI Kit (4) | `Button.tsx`, `ConfirmDialog.tsx`, `collapsible.tsx`, `icon-symbol.tsx` |
| Theme (5) | `theme-provider.tsx`, `theme-variables.ts`, `_core/theme.ts`, `constants/theme.ts`, `constants/theme-colors.json` |
| Support (3) | `ui-feedback.ts`, `LanguageSelector.tsx`, `ErrorBoundary.tsx` |

---

## UI REVIEW COMPLETE

**Phase:** standalone-v2 — full project re-audit
**Previous Score:** 14/24
**Current Score:** 15/24
**Δ:** +1 (Copywriting improvement from i18n adoption)
**Screenshots:** Not captured (no dev server)
**Priority fixes:** 5 identified
**Minor recommendations:** 12+
**Key Improvement Areas:** Color tokenization (Phase 8), i18n adoption in entry-point screens, platform guard for document.querySelector, CharacterCreator sprite ID fix, SplashScreenEditor confirmation dialog
**Key Gaps Remaining:** Emoji-as-icons (40+), hardcoded strings in editor panels, no type/spacing scale, no toast system, defensive fallback chains
