# Plan: UI Fixes (Post-Audit)

**Goal:** Address the top 5 findings from the UI audit (`standalone-UI-REVIEW.md`, score 15/24).

**Audit score delta target:** +4 (15/24 → 19/24)

---

## Wave 1 (Parallel — no dependencies)

### Plan 1.1: Fix 24 `colors['text-inverse'] ?? '#fff'` fallback chains

**Impact:** Color 3/4 → 4/4, Experience Design 3/4 → 4/4
**Affects:** Color (removes defensive fallback noise), Experience Design (cleaner error states)

- **Root cause:** `RuntimePalette` index signature `[key: string]: string | undefined` makes ALL bracket access return `| undefined`, so `colors['text-inverse']` is `string | undefined` even though the explicit property guarantees it.
- **Fix:** Create a `colorToken(key)` helper in `lib/_core/theme.ts` that returns `string` (narrowed type). Replace 24 instances of `colors['text-inverse'] ?? '#fff'` with `colors['text-inverse']` (no fallback needed since it's guaranteed). Same for 4 `colors.backdrop ?? 'rgba(...)'` instances.
- **Files to modify:**
  - `lib/_core/theme.ts` — add `colorToken()` helper
  - ~24 files with `colors['text-inverse'] ?? '#fff'` — replace with direct access
  - 4 files with `colors.backdrop ?? 'rgba(...)'` — same

### Plan 1.2: Emoji → IconSymbol (easy targets)

**Impact:** Visuals 2/4 → 3/4
**Affects:** Visuals (replaces emoji with consistent icon component, improves cross-platform rendering)

Replace emoji in simple button/header components. These are isolated one-off emojis, not data-driven.

- `components/editors/StorySceneEditor/SceneEditorHeader.tsx:37` — `"💾 Save"` → `<IconSymbol name="save" />`
- `components/editors/StorySceneEditor/MediaPickerRow.tsx:54` — `"📂 Pick Image"` / `"🎤 Pick Audio"`
- `components/editors/StorySceneEditor/ChoiceEditor.tsx:70` — no emoji here, but check
- `components/InteractiveObjectsEditor.tsx:207,215` — `'#fff'` conditionals (no emoji)
- `components/editors/ViewModeTabs.tsx:29,44` — hardcoded `'#fff'`, not emoji
- If `IconSymbol` lacks needed icon names, add mappings to `components/ui/icon-symbol.tsx`

### Plan 1.3: i18n — PropertiesPanel hardcoded placeholders

**Impact:** Copywriting 3/4 → 4/4
**Affects:** Copywriting (replaces ~15 hardcoded placeholder strings with translation keys)

- `components/editor/PropertiesPanel.tsx` — ~15 placeholder strings:
  - `"Select background..."`, `"Select character..."`, `"Select sprite..."`, `"Enter narration text..."`, `"Enter dialogue..."`, `"Enter choice text..."`, `"Select music..."`, `"Select sound..."`, `"Enter object name..."`, `"Enter variable name..."`, `"Enter value..."`, `"Select target scene (empty = end)"`
- Add translation keys to `lib/translations.ts` (EN + UK)
- Strings are used inside `renderAssetField` and various `render*` form helpers

### Plan 1.4: i18n — Manuscript hardcoded strings

**Impact:** Copywriting 3/4 → 4/4
**Affects:** Copywriting (replaces ~15 hardcoded strings)

- `components/editor/manuscript/StoryManuscriptBlock.tsx` — labels:
  - `"Narration"`, `"Dialogue"`, `"Choice Group"`, `"Read-only technical block"`, `"Редагується прямо у manuscript view"`
  - `"Write narration..."`, `"Speaker ID"`, `"Dialogue line..."`, `"Remove Line"`, `"Remove"`, `"+ Add Dialogue Line"`, `"Choice {index + 1}"`, `"Choice text..."`, `"Target scene ID"`, `"Remove Choice"`, `"+ Add Choice"`
- Add translation keys to `lib/translations.ts`

### Plan 1.5: i18n — SceneSelector filter labels + placeholders

**Impact:** Copywriting 3/4 → 4/4
**Affects:** Copywriting (replaces 6 filter labels + 1 placeholder)

- `SceneSelector.tsx:223-228` — `"All"`, `"Dialogue"`, `"Choices"`, `"Actions"`, `"Transitions"`, `"Cinematic"`
- `SceneSelector.tsx:358` — `"Search scenes..."` placeholder
- `SplashScreenEditor.tsx:133` — `{config ? 'Remove' : 'Add'}`
- `SplashScreenEditor.tsx:230` — `"📂 Pick {splash.type === 'image' ? 'Image' : 'Video'}"`
- `MediaPickerRow.tsx:54` — `"📂 Pick Image"` / `"🎤 Pick Audio"`
- `InteractiveObjectsEditor.tsx:48` — `'Delete Object'`, `'Are you sure?'`
- `SceneManager.tsx:203,216` — `"Scene name…"`, `"Search scenes…"`
- `WebSidebar.tsx:63` — `"Visual Novel"` (app title, not translated)

---

## Wave 2 (after Wave 1)

### Plan 2.1: Emoji → IconSymbol (SceneSelector template icons)

**Impact:** Visuals 3/4 → 4/4
**Depends on:** Plan 1.2 (IconSymbol mappings established)
**Affects:** Visuals (replaces 20 emoji in template scene definitions)

- `components/editor/SceneSelector.tsx:32-228` — 20 template scene definitions with emoji icons:
  - `💬`, `📖`, `🔀`, `🎬`, `🚶`, `👋`, `🖼️`, `🎵`, `🔇`, `⚠️`, `🏷️`, `❓`, `📷`, `🔍`, `💥`, `⚡`, `📋`
- **Challenge:** These icons are part of data (`TemplateScene.icon`), not JSX. Need to either:
  - (a) Change `icon` field type from `string` (emoji) to `IconSymbolName`, render via `<IconSymbol>`
  - (b) Keep emoji in data but override in JSX rendering
  - **Recommended:** (a) — change the data model, add missing IconSymbol mappings
- Add any missing MaterialIcons names to `icon-symbol.tsx` MAPPING

### Plan 2.2: Emoji → IconSymbol (Lego editor — low priority)

**Impact:** Visuals 4/4 (ceiling)
**Depends on:** Plan 1.2

- `components/lego-editor/AtomBlockComponent.tsx` — 5 emoji
- `components/lego-editor/LegoBlockLibrary.tsx` — 5 emoji
- `components/lego-editor/LegoFlowWorkspace.tsx` — 7 emoji

### Plan 2.3: Toast/snackbar system

**Impact:** Experience Design 3/4 → 4/4
**Depends on:** Wave 1 (no technical dependency, but higher effort)
**Affects:** Experience Design (replaces `Alert.alert()` with non-blocking feedback)

- Create `components/ui/Toast.tsx` — simple animated toast component
  - Position: bottom-center
  - Auto-dismiss after 3s
  - Types: success (green), error (red), info (blue)
  - Export `useToast()` hook with `showToast(message, type)`
- Create `lib/toast-store.ts` — Zustand store for toast queue
- Replace `Alert.alert()` calls in:
  - `app/editor.tsx` — save confirmations
  - `app/save-load.tsx` — save/load feedback
  - `InteractiveObjectsEditor.tsx` — delete confirmation
  - `StoryManuscriptScreen.tsx` — save feedback
  - Keep `Alert.alert()` for **destructive** actions (delete, overwrite) — those need blocking confirmation

### Plan 2.4: Spacing + type scale (design decision)

**Impact:** Typography 2/4 → 3/4, Spacing 2/4 → 3/4
**Depends on:** User design decision (needs approval)
**Affects:** Typography (type scale), Spacing (spacing scale + border radius)

- **Proposed type scale:** 6 sizes
  - `xs: 11` (label/helper), `sm: 13` (body small), `md: 15` (body), `lg: 18` (subheader), `xl: 24` (header), `2xl: 32` (hero)
  - Add as constants in `lib/typography.ts`
  - Eliminate fontSize: 8, 9, 10, 14, 16, 17, 20, 22, 28, 36, 48
- **Proposed spacing scale:** 6 steps
  - `xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 24`, `2xl: 32`
- **Proposed border radius:** 4 tokens
  - `sm: 6`, `md: 10`, `lg: 16`, `xl: 24` (pill)
- **Requires user sign-off on exact values before implementation**

---

## Summary

| Wave | Plans | Est. files modified | Est. effort |
|------|-------|---------------------|-------------|
| 1    | 5     | ~30                 | ~2h         |
| 2    | 4     | ~15                 | ~3h         |
| **Total** | **9** | **~45** | **~5h** |

## must_haves

- [ ] 24 fallback chains replaced (color cleanup)
- [ ] All easy-target emoji migrated to IconSymbol
- [ ] PropertiesPanel and Manuscript hardcoded strings translated
- [ ] SceneSelector emoji migrated
- [ ] Toast component exists and replaces Alert.alert for non-destructive feedback
- [ ] TypeScript check passes (`npx tsc --noEmit`)
- [ ] All existing tests pass (`npx vitest run`)
