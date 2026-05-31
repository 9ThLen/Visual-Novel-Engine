# Phase 07 — UI Review (Wave 1 UI Fixes)

**Audited:** 2026-05-28
**Baseline:** UI-SPEC.md (active design contract)
**Screenshots:** Not captured (no dev server running) — code-only audit
**Scope:** Plans 1.1–1.5: Color fallback removal, emoji→IconSymbol (easy targets), i18n of PropertiesPanel/Manuscript/SceneSelector/MediaPickerRow/InteractiveObjectsEditor/SceneManager, doc-first UX keys

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Core plan i18n targets done, but `manuscript.dialogue` key MISSING; 25+ hardcoded strings remain in touched files |
| 2. Visuals | 2/4 | 4 easy-target emoji replaced ✓; 20+ emoji remain including in settings.tsx, reader, SceneSelector, violating P0 |
| 3. Color | 3/4 | All 24 `?? '#fff'` fallback chains removed ✓; 16+ hardcoded `'#fff'` literals still present |
| 4. Typography | 3/4 | Unchanged this phase; multiple inline font sizes off UI-SPEC scale |
| 5. Spacing | 3/4 | Unchanged this phase; multiple inline spacing values off declared scale |
| 6. Experience Design | 2/4 | Fallback removal tightens type safety ✓; missing `manuscript.dialogue` key and hardcoded empty states degrade UX |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **Missing `manuscript.dialogue` translation key** — `StoryManuscriptBlock.tsx:54` calls `t('manuscript.dialogue')` but the key is not defined in EN/UK/PL translations. In dev mode this produces `console.warn('[i18n] Missing translation for key: manuscript.dialogue')` and renders the raw key `"manuscript.dialogue"` as text. **Fix:** Add `'manuscript.dialogue'` to `translations.ts` EN/UK/PL maps (e.g., EN: `'Dialogue'`, UK: `'Діалог'`, PL: `'Dialog'`).

2. **16+ hardcoded `'#fff'` color literals violate the Theme Contract** — UI-SPEC §P1 states "Component files must not introduce new hardcoded hex/rgb colors." After removing `?? '#fff'` fallback chains, the codebase still has inline `'#fff'` values for selected-item text, active tab text, and button labels that should use `colors['text-inverse']`. Affected files: `InteractiveObjectsEditor.tsx:210,218`, `ViewModeTabs.tsx:29,32,47,50`, `SplashScreenEditor.tsx:136,234,235,372`, `SceneEditorHeader.tsx:41,42`, `ChoiceEditor.tsx:70,88`, `WebTopBar.tsx:128`. **Fix:** Replace each `'#fff'` with `colors['text-inverse']`.

3. **~25 untranslated UI strings in touched files** — `SceneManager.tsx` (empty state "No Scenes Yet", buttons "Edit"/"Copy"/"Set Start"/"Delete"/"Flow"/"Play", delete dialog title), `InteractiveObjectsEditor.tsx` (header "Interactive Objects", "Add from Preset", "Objects", "Name", "Position (%)", "Actions"), `SplashScreenEditor.tsx` ("Splash Screen", "Presets", "Media File", "Duration", "Fade In", "Fade Out", "Pause story", "No file selected" — though `t('editor.noFileSelected')` exists), and `SceneEditorHeader.tsx` ("Scene Editor", "Save", "Back"). **Fix:** Add translation keys and replace hardcoded strings; fix "No file selected" at SplashScreenEditor.tsx:220 to use `t('editor.noFileSelected')`.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

**What was done correctly:**
- **PropertiesPanel.tsx** — All ~15 field labels/placeholders replaced with `t()` calls using `editor.properties.*` keys. `renderAssetField` uses `t()` for placeholder and search button. Close button has `t('a11y.closePanel')`. Good.
- **StoryManuscriptBlock.tsx** — `manuscript.narration`, `manuscript.choiceGroup`, `manuscript.technicalBlock`, `manuscript.editable`, `manuscript.writeNarration`, `manuscript.speakerId`, `manuscript.dialogueLine`, `manuscript.removeLine`, `manuscript.addDialogueLine`, `manuscript.choiceText`, `manuscript.targetSceneId`, `manuscript.removeChoice`, `editor.properties.addChoice`, `editor.properties.choice` all use `t()`.
- **SceneSelector.tsx** — CATEGORIES array uses `labelKey` with `t(cat.labelKey)` for accessible and visible labels. Search placeholder uses `t('editor.searchScenes')`. Empty state uses `t('editor.noMatchingScenes')`. Connect mode uses `t('sceneSelector.tapTargetToConnect')`.
- **SceneManager.tsx** — Placeholder strings use `t('editor.sceneManager.namePlaceholder')` (line 203) and `t('editor.sceneManager.searchPlaceholder')` (line 216). Back button uses `t('menu.back')`.
- **InteractiveObjectsEditor.tsx** — Delete confirmation dialog uses `t('editor.objects.delete')` and `t('editor.objects.deleteConfirm')` with translated cancel/delete buttons.
- **SplashScreenEditor.tsx** — Remove toggle dialog uses `t('splash.removeTitle')`, `t('splash.removeMessage')`, `t('splash.remove')`.
- **MediaPickerRow.tsx** — Pick Image/Audio uses `t('editor.pickImage')`/`t('editor.pickAudio')`, Library uses `t('editor.library')`, empty state uses `t('editor.noFileSelected')`.
- **`lib/translations.ts`** — 3-language support (EN/UK/PL). ~340 EN keys, ~320 UK keys, ~330 PL keys. Document-first UX keys (26 keys) fully translated in all 3 languages.
- **`lib/i18n.ts`** — `t()` function supports parameter interpolation `{param}` and falls back to EN → key name. `pluralize()` implemented.

**Issues:**
| Severity | File:Line | Issue |
|----------|-----------|-------|
| **BLOCKER** | `translations.ts` (all three maps) | Key `'manuscript.dialogue'` is **undefined**. `StoryManuscriptBlock.tsx:54` calls `t('manuscript.dialogue')` — only `manuscript.dialogueLine` exists. In dev, renders key name as text with a console.warn. |
| WARNING | `SceneEditorHeader.tsx:22-23` | "Scene Editor" hardcoded; should use `t('editor.sceneEditor')` |
| WARNING | `SceneEditorHeader.tsx:42` | "Save" button text hardcoded; should use `t('common.save')` or `t('editor.save')` |
| WARNING | `SceneEditorHeader.tsx:54` | "Back" text hardcoded; `t('menu.back')` exists |
| WARNING | `ViewModeTabs.tsx:34,52` | "Блоки" and "Превью" hardcoded in Russian; should use `t()` keys even if only one locale |
| WARNING | `WebSidebar.tsx:63` | "Visual Novel" hardcoded app title; `t('app.name')` exists in all 3 languages |
| WARNING | `SplashScreenEditor.tsx:220` | `'No file selected'` hardcoded; `t('editor.noFileSelected')` exists |
| WARNING | `SplashScreenEditor.tsx:104,155,201,252,277,308,376` | "Splash Screen", "Presets", "Media File (…)", "Duration (ms)", "Fade In (ms)", "Fade Out (ms)", "Pause story during splash" all hardcoded |
| WARNING | `InteractiveObjectsEditor.tsx:106,138,183,250-347` | Header "🎯 Interactive Objects", "Add from Preset", "Objects", "Edit:", "Name", "Object name", "Position (%)", "Actions" all hardcoded |
| WARNING | `SceneManager.tsx:127-128,185,238,241,250,252,255,304,307,311,315,329,332` | "Delete Scene", "Delete", "Cancel", "Back", "New Scene", "Templates", "No Scenes Yet", "Browse Templates", "Edit", "Copy", "Set Start", "Delete", "Flow", "Play" all hardcoded |
| WARNING | `SceneManager.tsx:205,218` | `accessibilityLabel="Scene Name"` and `accessibilityLabel="Search Scenes"` hardcoded English |
| INFO | `settings.tsx:147,152,164,201,212` | Section titles use emoji + `t()`, which is mixed — emoji is a visual concern but labels are translated |
| INFO | `sceneManager.tsx:89,150` | `\`Scene \${...}\`` and `\`New Scene \${...}\`` template literals for default names — acceptable for auto-generated content |

---

### Pillar 2: Visuals (2/4)

**What was done correctly:**
- `SceneEditorHeader.tsx` — `💾` → `<IconSymbol name="save">` ✓
- `MediaPickerRow.tsx` — `📂`/`🎤` → `<IconSymbol name="files">` ✓
- `ViewModeTabs.tsx` — Category-style emoji → `<IconSymbol name="blocks">` / `"preview"` ✓
- `SplashScreenEditor.tsx` — `📂` → `<IconSymbol name="files">`; also uses `"movie"` from MAPPING ✓
- `IconSymbol MAPPING` in `icon-symbol.tsx` — Added `movie: "movie"` and `mic: "mic"` ✓

**Issues:**
| Severity | Location | Issue |
|----------|----------|-------|
| **P0 VIOLATION** | `SceneSelector.tsx:38-228` | 17 template scene definitions use emoji (`💬📖🔀🎬🚶👋🖼️🎵🔇🔊🏷️❓📷🔍💥⚡`) as primary visual icons in template data |
| **P0 VIOLATION** | `SceneSelector.tsx:222-228` | 6 CATEGORY icons use emoji (`📋💬🔀🚶🎬📷`) |
| **P0 VIOLATION** | `SceneSelector.tsx:323,326,496` | Close `✕`, header `🔗`/`📚`, and connect button `🔗` all emoji |
| **P0 VIOLATION** | `settings.tsx:147,152,164,201,212` | Section headers use emoji `🌐🔊✏️▶️ℹ️` — these are P0 "primary command" nav patterns |
| **P0 VIOLATION** | `story-reader-responsive.tsx:478,485` | Reader menu uses emoji `📖⏸▶` for primary nav actions |
| WARNING | `InteractiveObjectsEditor.tsx:106` | `🎯` emoji in header |
| WARNING | `MiniPreview.tsx:53,119` | `✕` close, `🎵` music indicator emoji |
| WARNING | `dialogue-history.tsx:144` | `✕` close emoji |
| WARNING | `PreviewScreen.tsx:214` | `▶` in "tap to continue" |
| WARNING | `LegoBlockLibrary.tsx:39-42,101` | 4 emoji icons + `🔍` search placeholder emoji |
| WARNING | `LegoFlowWorkspace.tsx:35-38,80,196` | 8+ emoji used for atom icons, audio type, action buttons |
| WARNING | `AtomBlockComponent.tsx:14-17` | 3 emoji atom icons |

**Note:** The SceneSelector template emoji issue was explicitly deferred to Plan 2.1 (Wave 2). The Lego editor emoji was deferred to Plan 2.2. However, the settings.tsx and reader emoji were not mentioned in any plan and remain as P0 violations of UI-SPEC §"P0 — Visual Consistency".

---

### Pillar 3: Color (3/4)

**What was done correctly:**
- **All `?? '#fff'` fallback chains removed** — Zero matches in grep. This was the primary target (24 instances).
- **All `?? 'rgba(...)'` fallback chains removed** — Zero matches.
- **`RuntimePalette` type fixed** — `lib/_core/theme.ts` now has an explicit `RuntimePalette` type with all required properties including `'text-inverse'`, `'foreground-inverse'`, `backdrop`, VN reader tokens, and editor tokens. No index signature that would make all values `| undefined`.
- **`buildRuntimePalette`** properly maps tokens with fallback logic internal to the function (not scattered across components).

**Issues:**
| Severity | File:Line | Issue |
|----------|-----------|-------|
| WARNING | `InteractiveObjectsEditor.tsx:210,218` | `color: selectedObjectId === obj.id ? '#fff' : colors.foreground` — should use `colors['text-inverse']` |
| WARNING | `ViewModeTabs.tsx:29,32,47,50` | `color: viewMode === ... ? '#fff' : colors.muted` — should use `colors['text-inverse']` |
| WARNING | `SplashScreenEditor.tsx:136,234,235,372` | `color: '#fff'` — should use `colors['text-inverse']` |
| WARNING | `SceneEditorHeader.tsx:41,42` | `color="#fff"` — should use `colors['text-inverse']` |
| WARNING | `ChoiceEditor.tsx:70,88` | `color: '#fff'` — should use `colors['text-inverse']` |
| WARNING | `WebTopBar.tsx:128` | `color: variant === 'primary' ? '#fff' : ...` — should use `colors['text-inverse']` |
| WARNING | `LegoCanvas.tsx:402` | `color: '#fff'` — should use token |

**Scoring note:** The primary target (fallback chains) was fully achieved, earning the score of 3. However, hardcoded `'#fff'` still appears ~16 times, preventing a 4/4. These are not `??` fallbacks but inline conditional colors that should use `colors['text-inverse']`.

---

### Pillar 4: Typography (3/4)

No deliberate changes in this phase. Existing issues noted for completeness:

- UI-SPEC declares: 32/20/17/14/12/11 font sizes.
- Many components use sizes outside this scale: fontSize 13 (common in SceneSelector, MediaPickerRow, InteractiveObjectsEditor), fontSize 15 (StoryManuscriptBlock, SceneSelector), fontSize 16 (SceneEditorHeader, SceneSelector, StoryManuscriptBlock, WebSidebar), fontSize 18 (SceneSelector header), fontSize 22 (dialogue-history), fontSize 24+ (settings).
- `fontWeight: '800'` is used in SceneManager and SceneEditorHeader — UI-SPEC calls for numeric weights only, and 800 is not in the spec scale (which uses 800 for page title only, 700 for section, 600 for UI label/caption/micro). This is acceptable usage for page titles.
- These are pre-existing issues not introduced in this phase.

**Score: 3/4** — No regressions introduced. Pre-existing deviation from spec noted.

---

### Pillar 5: Spacing (3/4)

No deliberate changes in this phase. Existing issues noted for completeness:
- UI-SPEC declares spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Inline values like 6, 10, 14, 20, 22, 28 appear frequently (e.g., `gap: 6`, `borderRadius: 6`, `padding: 14`, `paddingVertical: 20`, `borderRadius: 22`).
- SceneManager uses `borderRadius: 24` (empty state card) — not in radius scale (which has sm:6, md:8, lg:12, xl:16, full:999).
- These are pre-existing issues not introduced in this phase.

**Score: 3/4** — No regressions introduced. Pre-existing deviation from spec noted.

---

### Pillar 6: Experience Design (2/4)

**What was done correctly:**
- **RuntimePalette type safety** — Explicit required fields mean `colors['text-inverse']` is guaranteed `string`, not `string | undefined`. This eliminates the need for defensive `?? '#fff'` fallbacks, making error states cleaner.
- **InteractiveObjectsEditor delete flow** — dialog title + message + buttons all translated ✓
- **PropertiesPanel** — all form fields show required indicators (via `missingFields`) with `t('editor.properties.required')` in both error and non-error cases.
- **StoryManuscriptBlock** — translate-on-read for all labels; "Remove Line" button disabled when only 1 entry remains (prevents empty dialogue state).
- **`t()` fallback chain** — current language → English → key name. Even if a key is missing, the app won't crash.

**Issues:**
| Severity | File:Line | Issue |
|----------|-----------|-------|
| **BLOCKER** | `StoryManuscriptBlock.tsx:54` + translations.ts | Missing `manuscript.dialogue` key causes `console.warn('[i18n] Missing translation for key: manuscript.dialogue')` in dev and renders key name as UI text |
| WARNING | `SceneManager.tsx:126-138` | `Alert.alert` for scene deletion uses hardcoded English title/message: `"Delete Scene"`, `'Delete "..."?'` |
| WARNING | `SceneManager.tsx:205,218` | `accessibilityLabel` hardcoded English for search/new-scene inputs |
| WARNING | `SplashScreenEditor.tsx:220` | `'No file selected'` instead of `t('editor.noFileSelected')` — the translation key exists but is not used |
| WARNING | `InteractiveObjectsEditor.tsx:271-285` | "Name" label and "Object name" placeholder hardcoded |
| WARNING | `SplashScreenEditor.tsx:376` | "Pause story during splash" hardcoded | 
| INFO | Removal of `?? '#fff'` fallbacks means missing palette tokens would now produce `undefined` color values — surfaces as invisible text/UI rather than visible fallback. Risk is mitigated by explicit required fields in RuntimePalette type. |
| INFO | `confirmDeleteBlockTitle` and `confirmDeleteBlockMessage` translation text says "This action can be undone" which is contradictory for a delete confirmation dialog. Not introduced in this phase. |

**Accessibility check:**
- `SceneSelector.tsx` — All Pressable buttons have `accessibilityRole="button"` and `accessibilityLabel` using `t()` ✓
- `PropertiesPanel.tsx` — Close, duplicate, delete buttons have labels ✓
- `MediaPickerRow.tsx` — Buttons have labels ✓
- `SceneManager.tsx` — Back button uses `t('menu.back')` ✓; but scene input and search input have hardcoded English labels ✗

---

## Files Audited

### Primary audit targets (modified for Wave 1):
- `lib/_core/theme.ts` — RuntimePalette type fix
- `lib/translations.ts` — All EN/UK/PL translation maps
- `lib/i18n.ts` — t() function
- `components/editor/PropertiesPanel.tsx` — i18n field labels/placeholders
- `components/editor/manuscript/StoryManuscriptBlock.tsx` — i18n manuscript labels
- `components/editor/SceneSelector.tsx` — i18n filter labels, search, empty state
- `components/editor/SceneManager.tsx` — i18n placeholders
- `components/InteractiveObjectsEditor.tsx` — i18n delete dialog
- `components/editor/BlockLibraryPanel.tsx` — minor i18n
- `components/editor/SceneComposer.tsx` — minor i18n
- `components/editor/TimelinePanel.tsx` — minor i18n
- `components/editor/MiniPreview.tsx` — emoji remaining
- `components/editor/PreviewScreen.tsx` — minor i18n
- `components/editor/StoryFlowScreen.tsx` — emoji remaining
- `components/editor/modals/AssetPicker.tsx` — minor i18n
- `components/editor/modals/CharacterCreator.tsx` — minor i18n
- `components/editor/modals/SaveSceneDialog.tsx` — minor i18n
- `components/editors/SceneEditorHeader.tsx` — emoji→IconSymbol; hardcoded strings
- `components/editors/ViewModeTabs.tsx` — emoji→IconSymbol; hardcoded Russian strings
- `components/editors/StorySceneEditor/MediaPickerRow.tsx` — i18n + emoji→IconSymbol
- `components/editors/StorySceneEditor/SceneEditorForm.tsx` — i18n
- `components/SplashScreenEditor.tsx` — emoji→IconSymbol; partial i18n
- `components/ui/icon-symbol.tsx` — MAPPING extensions

### Referenced for supplementary findings:
- `components/WebSidebar.tsx` — hardcoded "Visual Novel"
- `components/story-reader-responsive.tsx` — emoji in reader menu
- `components/dialogue-history.tsx` — emoji
- `components/ErrorBoundary.tsx` — uses t() correctly
- `components/ReaderMenu.tsx` — baseline
- `app/settings.tsx` — emoji in section headers
- `app/save-load.tsx` — uses t() correctly
- `app/tabs/index.tsx` — uses t() correctly
- `components/lego-editor/AtomBlockComponent.tsx` — emoji remaining
- `components/lego-editor/LegoBlockLibrary.tsx` — emoji remaining
- `components/lego-editor/LegoFlowWorkspace.tsx` — emoji remaining
- `components/editors/StorySceneEditor/ChoiceEditor.tsx` — hardcoded '#fff'
- `components/WebTopBar.tsx` — hardcoded '#fff'
- `__tests__/unit/lib/translations.test.ts` — updated for 3-language + doc keys

---

## Registry Safety

`components.json` not found — shadcn not initialized. Registry safety audit skipped.

---

## Regression Risk: Fallback Removal

The removal of `?? '#fff'` fallback chains is architecturally correct, but carries a regression risk: if any component accesses a token name that is not guaranteed by the `RuntimePalette` type (e.g., dynamic bracket access with a misspelled key), the result will be `undefined` rather than fallback white. The `RuntimePalette` type makes all documented tokens required, so TypeScript will catch static access errors. Dynamic access (e.g., `` colors[`lego-${category}`] ``) still returns `string | undefined` and needs `!` or runtime check. This pattern exists in `SceneSelector.tsx:310` — `map[category] || colors.primary` provides its own fallback. No regression from this pattern found.

---

## Summary

| Metric | Count |
|--------|-------|
| Priority fixes identified | 3 |
| BLOCKER findings | 2 (missing `manuscript.dialogue` key, empty state/delete dialogs untranslated) |
| P0 violations (emoji-as-icon) | 6+ locations |
| Hardcoded `'#fff'` remaining | ~16 instances |
| Missing i18n strings in touched files | ~25 strings |
| WARNING findings | 18 |

The Wave 1 plan targets (fallback removal, easy-target emoji, core i18n) are substantively achieved. The score delta from the previous standalone audit (15/24) remains at parity because the improvements in color safety and targeted i18n are balanced by the new `manuscript.dialogue` regression and the many untranslated strings in files that were partially converted.
