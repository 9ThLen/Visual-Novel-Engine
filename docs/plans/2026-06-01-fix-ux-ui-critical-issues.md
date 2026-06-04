# VNE UX/UI Critical Issues — Fix Plan

> **Для Hermes:** Use `subagent-driven-development` skill to implement task-by-task. Model: `tencent/hy3-preview:free` for execution.

**Goal:** Fix 35 UX/UI and logic issues found in audit (5 Critical, 12 Important, 8 Feature, 10 Low)

**Architecture:** Wave approach — Critical first, then Important, then Low/Feature. Each wave is independent and can be committed separately.

**Tech Stack:** React Native, Expo, Zustand, NativeWind, react-native-reanimated

**Source Audit:** `wiki/ux-ui-analysis-2026-06-01.md`

---

## Wave 1: 🔴 Critical Fixes (5 issues)

> **Estimated time:** ~2-3 hours
> **Risk:** Low — isolated changes, no API changes

---

### Task 1.1: Fix `text-inverse` fallback colors across codebase

**Objective:** Remove all hardcoded `#ffffff` / `#fff` fallbacks for `colors['text-inverse']` and use theme-safe alternatives.

**Files:**
- Modify: `components/story-reader-responsive.tsx:552,596,598,604`
- Modify: `components/document-editor/DocumentSceneEditor.tsx:1276`
- Modify: `components/editor/BlockLibraryPanel.tsx:259`
- Modify: `components/editor/modals/AssetPicker.tsx:274,279,378,379,428,429,480`
- Modify: `components/editor/modals/CharacterCreator.tsx:224,315`
- Modify: `components/editor/modals/SaveSceneDialog.tsx:208,250`
- Modify: `components/editor/PreviewScreen.tsx:277,279`
- Modify: `components/editor/PropertiesPanel.tsx:111,318,362,385`
- Modify: `components/editor/SceneComposer.tsx:319`

**Step 1: Find all occurrences**

Run: `cd /mnt/d/Programs/D/visual_novel_engine && grep -rn "text-inverse.*#ffffff\|text-inverse.*#fff" --include='*.tsx' --include='*.ts' components/ hooks/ app/`

**Step 2: Replace fallback pattern**

Replace all instances of:
```tsx
color: colors['text-inverse'] ?? '#ffffff'
color: colors['text-inverse'] ?? '#fff'
```

With:
```tsx
color: colors['text-inverse']
```

Rationale: `text-inverse` is ALWAYS defined in RuntimePalette (mapped from `foreground-on-primary`). The fallback is never needed and is dangerous on light theme.

**Step 3: Verify no `?? '#ffffff'` or `?? '#fff'` remain**

Run: `grep -rn "?? '#ffffff'\|?? '#fff'" --include='*.tsx' --include='*.ts' components/ hooks/ app/`

Expected: 0 results

**Step 4: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add components/ hooks/ app/
git commit -m "fix: remove hardcoded white fallbacks for text-inverse (45 places)"
```

---

### Task 1.2: Fix Animated.Value leak in CharacterDisplay rendering

**Objective:** Stop creating `new Animated.Value()` on every render in StoryReaderResponsive's character map.

**Files:**
- Modify: `components/story-reader-responsive.tsx:370-393` (character rendering)
- Read first: `components/story-reader-responsive.tsx:370-393`

**Current code (buggy):**
```tsx
{executor.sceneState.characters.map((char: CharacterRuntimeState) => {
  const charId = char.characterId;
  const charSource = resolvedCharUris[charId];
  if (!charSource) return null;
  const uri = typeof charSource === 'string' ? charSource : (charSource as { uri: string }).uri;
  return (
    <CharacterDisplay
      key={charId}
      instance={{
        id: charId,
        characterId: charId,
        spriteId: '',
        position: 'center' as CharacterPosition,
        zIndex: 0,
        animatedOpacity: new RNAnimated.Value(1),    // ← LEAK
        animatedTranslateX: new RNAnimated.Value(0),  // ← LEAK
        animatedTranslateY: new RNAnimated.Value(0),  // ← LEAK
        animatedScale: new RNAnimated.Value(1),       // ← LEAK
      }}
      spriteUri={uri}
      dialogueTop={isPortrait ? dims.height - layout.dialogueHeight : undefined}
    />
  );
})}
```

**Step 1: Add character animation cache via useRef + useMemo**

Add above the component or at module level:
```tsx
// Stable animation values cache per character ID
const animValueCache = useRef<Record<string, {
  opacity: RNAnimated.Value;
  translateX: RNAnimated.Value;
  translateY: RNAnimated.Value;
  scale: RNAnimated.Value;
}>>({});

function getCharAnimValues(charId: string) {
  if (!animValueCache.current[charId]) {
    animValueCache.current[charId] = {
      opacity: new RNAnimated.Value(1),
      translateX: new RNAnimated.Value(0),
      translateY: new RNAnimated.Value(0),
      scale: new RNAnimated.Value(1),
    };
  }
  return animValueCache.current[charId];
}
```

**Step 2: Replace inline `new Animated.Value()` in character map**

```tsx
{executor.sceneState.characters.map((char: CharacterRuntimeState) => {
  const charId = char.characterId;
  const charSource = resolvedCharUris[charId];
  if (!charSource) return null;
  const uri = typeof charSource === 'string' ? charSource : (charSource as { uri: string }).uri;
  const anim = getCharAnimValues(charId);
  return (
    <CharacterDisplay
      key={charId}
      instance={{
        id: charId,
        characterId: charId,
        spriteId: '',
        position: 'center' as CharacterPosition,
        zIndex: 0,
        animatedOpacity: anim.opacity,
        animatedTranslateX: anim.translateX,
        animatedTranslateY: anim.translateY,
        animatedScale: anim.scale,
      }}
      spriteUri={uri}
      dialogueTop={isPortrait ? dims.height - layout.dialogueHeight : undefined}
    />
  );
})}
```

**Step 3: Verify no `new RNAnimated.Value` or `new Animated.Value` remains in render path**

Run: `grep -n "new.*Animated.Value" components/story-reader-responsive.tsx`

Expected: 0 results (or only in non-render code)

**Step 4: Commit**

```bash
git add components/story-reader-responsive.tsx
git commit -m "fix: cache Animated.Value per character ID to prevent render leak"
```

---

### Task 1.3: Fix `dialogueTop` prop — implement or remove

**Objective:** Either implement the `dialogueTop` positioning in CharacterDisplay or remove the prop entirely.

**Analysis:** The prop is defined in Props (line 9), passed from parent (line 390), but NOT destructured in the component function (line 12). The component uses `useWindowDimensions()` internally but doesn't position relative to dialogue.

**Decision:** The simplest fix that preserves the intended behavior is to use `dialogueTop` to calculate character bottom offset. But since CharacterDisplay receives absolute position from the parent layer (flexbox centered at bottom), the prop was likely meant for pixel-based positioning. Given the complexity of the full fix, the pragmatic approach is:

**Option A (Quick):** Remove `dialogueTop` from Props and all call sites.
**Option B (Full):** Implement character positioning relative to dialogue box.

**Recommended: Option A** — the parent layout already handles positioning via `paddingBottom: layout.dialogueHeight - 20` on the characters container.

**Files:**
- Modify: `components/CharacterDisplay.tsx:6-37` — remove `dialogueTop` from Props
- Modify: `components/story-reader-responsive.tsx:376-392` — remove `dialogueTop` prop from CharacterDisplay usage

**Step 1: Remove from CharacterDisplay Props interface**

```tsx
interface Props {
  instance: AnimatedCharacterInstance;
  spriteUri: string;
  // dialogueTop removed — parent handles positioning via layout
}
```

**Step 2: Remove from CharacterDisplay function signature**

```tsx
export const CharacterDisplay = React.memo(function CharacterDisplay({ instance, spriteUri }: Props) {
```

**Step 3: Remove from call site in StoryReaderResponsive**

Remove the line:
```tsx
dialogueTop={isPortrait ? dims.height - layout.dialogueHeight : undefined}
```

**Step 4: Verify no references remain**

Run: `grep -rn "dialogueTop" --include='*.tsx' --include='*.ts' components/`

Expected: 0 results

**Step 5: Commit**

```bash
git add components/CharacterDisplay.tsx components/story-reader-responsive.tsx
git commit -m "fix: remove unused dialogueTop prop from CharacterDisplay"
```

---

### Task 1.4: Add user-visible warning for no-op block types

**Objective:** Add a visible warning/indicator when `sound`, `camera`, or `interactive_object` blocks are executed, so users know the feature is not yet implemented.

**Files:**
- Modify: `lib/engine/useSceneExecutor.ts:183-201` (the no-op handlers)
- Read first: `lib/engine/useSceneExecutor.ts:183-201`

**Current code:**
```tsx
case 'sound':
  if (__DEV__) console.warn('[useSceneExecutor] no-op block type: sound', step.id);
  break;
case 'camera':
  if (__DEV__) console.warn('[useSceneExecutor] no-op block type: camera', step.id);
  break;
// (interactive_object similar)
```

**Step 1: Add development-mode visible warning via Alert (native) or console.error (web)**

Replace the no-op handlers with a pattern that works in both dev and shows something visible:

```tsx
case 'sound': {
  if (__DEV__) {
    console.warn('[useSceneExecutor] no-op block type: sound', step.id);
  }
  break;
}
case 'camera': {
  if (__DEV__) {
    console.warn('[useSceneExecutor] no-op block type: camera', step.id);
  }
  break;
}
case 'interactive_object': {
  if (__DEV__) {
    console.warn('[useSceneExecutor] no-op block type: interactive_object', step.id);
  }
  break;
}
```

**Note:** The current code already has `__DEV__` guards. The real issue is that these blocks are exposed in the UI but silently do nothing. The proper fix is a two-part approach:

1. **In executor:** Add `console.error` (no `__DEV__` guard) so it shows in production logs too:
```tsx
case 'sound':
  console.warn('[useSceneExecutor] Block type "sound" is not yet implemented', step.id);
  break;
```

2. **In BlockLibraryPanel:** Add a visual indicator (badge or icon) for unimplemented blocks.

**Step 2: Add "Not implemented" badge in BlockLibraryPanel**

First, check the current state:
```bash
cat components/editor/BlockLibraryPanel.tsx | grep -n "sound\|camera\|interactive_object"
```

In BlockLibraryPanel, where blocks are rendered, add for each no-op type:
```tsx
// For each no-op block type in the block list
const NO_OP_TYPES = new Set(['sound', 'camera', 'interactive_object']);

// In the render function for each block button/item:
{NO_OP_TYPES.has(block.type) && (
  <Text style={{ fontSize: 10, color: colors.warning, fontWeight: '600' }}>
    ⚠ SOON
  </Text>
)}
```

**Step 3: Commit**

```bash
git add lib/engine/useSceneExecutor.ts components/editor/BlockLibraryPanel.tsx
git commit -m "feat: add visible warnings for unimplemented block types (sound, camera, interactive_object)"
```

---

### Task 1.5: Fix `followWriting()` scroll anti-pattern in DocumentSceneEditor

**Objective:** Remove `followWriting()` calls from `onFocus` handlers and `onContentSizeChange` that cause aggressive auto-scroll. Replace with smart scroll that only activates when cursor leaves viewport.

**Files:**
- Modify: `components/document-editor/DocumentSceneEditor.tsx:740-763` (followWriting + scrollToWritingPosition)
- Modify: `components/document-editor/DocumentSceneEditor.tsx:837` (followWriting call in update handler)
- Modify: `components/document-editor/DocumentSceneEditor.tsx:981,1036` (followWriting in onFocus/onContentSizeChange)

**Read first:** `components/document-editor/DocumentSceneEditor.tsx:740-770,830-840,975-985,1030-1040`

**Step 1: Remove `followWriting` calls from onFocus/onContentSizeChange**

Remove or comment out lines:
```tsx
// Line ~837: remove followWriting(sceneId) from update handler
```

And in `SectionPage.tsx` or equivalent onFocus handlers (lines ~981, ~1036):
```tsx
// Remove: if (isLastBlock) followWriting(documentScene.sceneId);
```

**Step 2: Replace `followWriting` with smart scroll approach**

Current implementation:
```tsx
const scrollToWritingPosition = useCallback(() => {
  // ... scrolls to bottom
}, [keyboardHeight, ...]);

const followWriting = useCallback((sceneId: string) => {
  // ...
  scrollToWritingPosition();
}, [scrollToWritingPosition]);
```

New implementation — add cursor tracking ref:
```tsx
const cursorYRef = useRef(0);
const viewportHeightRef = useRef(0);

// Track cursor position (called from TextInput onSelectionChange)
const handleCursorPositionChange = useCallback((y: number) => {
  cursorYRef.current = y;
}, []);

// Smart follow: only scroll when cursor is below visible area
const scrollToWritingPosition = useCallback(() => {
  const cursorY = cursorYRef.current;
  const viewportH = viewportHeightRef.current;
  const scrollY = scrollViewRef.current?.contentOffset?.y ?? 0;

  // Only scroll if cursor is below viewport
  if (cursorY > scrollY + viewportH - 100) {
    scrollViewRef.current?.scrollTo({
      y: cursorY - viewportH / 2,
      animated: true,
    });
  }
  // Also handle keyboard overlay
  if (keyboardHeight > 0) {
    scrollViewRef.current?.scrollTo({
      y: cursorY - (viewportHeightRef.current - keyboardHeight) / 2,
      animated: true,
    });
  }
}, [keyboardHeight]);
```

**Step 3: Add onSelectChange handler to TextInput**

On each TextInput in the editor, add:
```tsx
onSelectionChange={(e) => {
  const { start } = e.nativeEvent.selection;
  // Estimate cursor Y position based on text content
  const textBeforeCursor = value.substring(0, start);
  const linesBeforeCursor = textBeforeCursor.split('\n').length;
  const estimatedCursorY = linesBeforeCursor * LINE_HEIGHT;
  handleCursorPositionChange(estimatedCursorY);
}}
```

**Step 4: Track viewport height from onLayout**

Add to the main ScrollView or page container:
```tsx
onLayout={(e) => {
  viewportHeightRef.current = e.nativeEvent.layout.height;
}}
```

**Step 5: Commit**

```bash
git add components/document-editor/DocumentSceneEditor.tsx
git commit -m "fix: replace aggressive followWriting scroll with smart cursor-tracking scroll"
```

---

## Wave 2: 🟡 Important Fixes (12 issues)

> **Estimated time:** ~4-5 hours
> **Risk:** Medium — touches multiple components but isolated

---

### Task 2.1: Replace hardcoded rgba/hex colors with theme tokens

**Objective:** Replace 7 hardcoded color values in story-reader-responsive.tsx and ReaderMenu.tsx with `colors.*` tokens.

**Files:**
- Modify: `components/story-reader-responsive.tsx:449,498,596,598`
- Modify: `components/ReaderMenu.tsx:86`

**Step 1: Create fallbacks using theme tokens**

| Current | Replacement | Rationale |
|---------|-------------|-----------|
| `colors.dialogueBg ?? 'rgba(15, 14, 23, 0.92)'` | `colors.dialogueBg` | Already defined in theme |
| `colors.choiceBg ?? 'rgba(124,58,237,0.12)'` | `colors.choiceBg` | Already defined in theme |
| `'rgba(0,0,0,0.45)'` (ControlButton bg) | `colors.backdrop` | Exact semantic match |
| `'rgba(255,255,255,0.18)'` (ControlButton border) | `colors.borderSubtle ?? colors.border` | Theme token for subtle borders |
| `'rgba(0, 0, 0, 0.6)'` (ReaderMenu overlay) | `colors.backdrop` | Exact semantic match |

**Step 2: Make replacement**

In `story-reader-responsive.tsx`:
```tsx
// Line 449: dialogueBg
backgroundColor: colors.dialogueBg,
// Remove: ?? 'rgba(15, 14, 23, 0.92)'

// Line 498: choiceBg
backgroundColor: colors.choiceBg,
// Remove: ?? 'rgba(124,58,237,0.12)'

// Line 596: ControlButton bg
backgroundColor: active ? colors.primary : colors.backdrop,
// Replace: 'rgba(0,0,0,0.45)'

// Line 598: ControlButton border
borderColor: active ? colors.primary : (colors['border-subtle'] ?? colors.border),
// Replace: 'rgba(255,255,255,0.18)'
```

In `ReaderMenu.tsx:86`:
```tsx
backgroundColor: colors.backdrop,
// Replace: 'rgba(0, 0, 0, 0.6)'
```

**Step 3: Verify**

Run: `grep -rn "rgba(,0,0,0.45\|rgba(255,255,255,0.18)\|rgba(0, 0, 0, 0.6)" --include='*.tsx' components/`

Expected: 0 results

**Step 4: Commit**

```bash
git add components/story-reader-responsive.tsx components/ReaderMenu.tsx
git commit -m "fix: replace hardcoded rgba colors with theme tokens"
```

---

### Task 2.2: Add accessibilityLabel to InteractiveObjects

**Objective:** Make interactive objects accessible to screen readers.

**Files:**
- Modify: `components/InteractiveObjectsLayer.tsx:190-214` (InteractiveObjectView Pressable)

**Step 1: Add accessibility props to the Pressable**

```tsx
<Pressable
  style={({ pressed }) => [
    styles.objectPressable,
    {
      opacity: pressed ? 0.7 : 1,
    },
  ]}
  onPress={onPress}
  accessible={true}
  accessibilityLabel={object.name || t('reader.interactiveObject', { id: object.id })}
  accessibilityRole="button"
  accessibilityHint={t('reader.interactiveObjectHint')}
>
```

**Step 2: Add i18n keys**

Add to `lib/translations/uk.json` and `en.json`:
```json
{
  "reader.interactiveObject": "Interactive Object: {{id}}",
  "reader.interactiveObjectHint": "Tap to interact"
}
```

**Step 3: Add useI18n to InteractiveObjectView**

```tsx
const { t } = useI18n();
```

**Step 4: Commit**

```bash
git add components/InteractiveObjectsLayer.tsx lib/translations/
git commit -m "feat: add accessibility labels to interactive objects (a11y)"
```

---

### Task 2.3: Auto-play resumes after choice selection

**Objective:** After user makes a choice in StoryReaderResponsive, auto-play should resume if it was active.

**Files:**
- Modify: `components/story-reader-responsive.tsx:240-253` (auto-play effect)

**Step 1: Add auto-play resume after choice selection**

The auto-play effect already exists:
```tsx
useEffect(() => {
  if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
  if (!autoPlayActive || isTyping) return;
  autoPlayTimer.current = setTimeout(() => {
    if (hasChoices) return;
    if (executor.canAdvance) executor.advance();
  }, AUTO_PLAY_DELAY_MS);
  return () => { if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current); };
}, [autoPlayActive, isTyping, hasChoices, executor, pageIndex]);
```

The issue: when `hasChoices` becomes `false` after a choice, the effect depends on `pageIndex` or other deps changing. If nothing changes, auto-play doesn't resume.

**Fix:** Add `executor.currentStepIndex` as a dependency:
```tsx
}, [autoPlayActive, isTyping, hasChoices, executor, pageIndex, executor.currentStepIndex]);
```

This ensures the effect re-runs when the executor advances past the choice.

**Step 2: Commit**

```bash
git add components/story-reader-responsive.tsx
git commit -m "fix: resume auto-play after choice selection"
```

---

### Task 2.4: Increase turbo skip interval for better UX

**Objective:** Change turbo skip interval from 180ms to 320ms for a more comfortable fast-forward experience.

**Files:**
- Modify: `components/story-reader-responsive.tsx:261-271` (turbo interval)

**Current:**
```tsx
turboInterval.current = setInterval(() => {
  // ...
}, 180);
```

**Change to:**
```tsx
}, 320);
```

**Step 1: Commit**

```bash
git add components/story-reader-responsive.tsx
git commit -m "fix: increase turbo skip interval from 180ms to 320sm for better UX"
```

---

### Task 2.5: Add "Choose option" hint when choices are displayed

**Objective:** Show a hint text when user needs to make a choice (currently nothing indicates they should choose).

**Files:**
- Modify: `components/story-reader-responsive.tsx:528-535` (bottom bar)

**Step 1: Add choice hint after the existing "Tap to continue" logic**

```tsx
<View className="flex-row gap-2 items-center">
  {!isTyping && !hasChoices && (
    <Text style={[{ color: colors.muted }, { fontSize: 12 }]}>{t('reader.tapToContinue')} ▼</Text>
  )}
  {hasChoices && !isTyping && (
    <Text style={[{ color: colors.muted }, { fontSize: 12 }]}>{t('reader.chooseOption')} ▶</Text>
  )}
  <Pressable ...>
```

**Step 2: Add i18n key**

```json
{
  "reader.chooseOption": "Choose an option"
}
```

**Step 3: Commit**

```bash
git add components/story-reader-responsive.tsx lib/translations/
git commit -m "feat: add 'Choose an option' hint when choices are displayed"
```

---

### Task 2.6: Make ReaderMenu responsive

**Objective:** Fix the ReaderMenu positioning to work on small screens.

**Files:**
- Modify: `components/ReaderMenu.tsx:89-103` (menuContainer styles)

**Current:**
```tsx
menuContainer: {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: [{ translateX: -160 }, { translateY: -200 }],
  width: 320,
  // ...
}
```

**Step 1: Make width responsive with max-width**

```tsx
menuContainer: {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: [{ translateX: -160 }, { translateY: -200 }],
  width: 320,
  maxWidth: '90%',
  // ...
}
```

**Step 2: Even better — use screen dimensions**

Since `useWindowDimensions()` is already used elsewhere:
```tsx
const { width: screenWidth } = useWindowDimensions();

// In style:
width: Math.min(320, screenWidth - 32),
```

**Step 3: Commit**

```bash
git add components/ReaderMenu.tsx
git commit -m "fix: make ReaderMenu responsive on small screens"
```

---

### Task 2.7: Rename `_isLastPage` to `needsUserInput`

**Objective:** Rename the misleading variable to clarify its purpose.

**Files:**
- Modify: `components/story-reader-responsive.tsx:241,533`

**Current:**
```tsx
const _isLastPage = hasChoices;
// ...
{!isTyping && !_isLastPage && (
```

**Replace with:**
```tsx
const awaitingChoice = hasChoices;
// ...
{!isTyping && !awaitingChoice && (
```

**Step 1: Commit**

```bash
git add components/story-reader-responsive.tsx
git commit -m "refactor: rename _isLastPage to awaitingChoice for clarity"
```

---

### Task 2.8: Remove double `stopReaderPlayback()` in save-load and settings

**Objective:** Remove redundant cleanup calls — `stopReaderPlayback()` is called both in the main body and the cleanup return of `useFocusEffect`.

**Files:**
- Modify: `app/save-load.tsx:89-96`
- Modify: `app/settings.tsx:22-29`

**Current pattern:**
```tsx
useFocusEffect(
  useCallback(() => {
    void stopReaderPlayback();
    return () => {
      void stopReaderPlayback();  // redundant
    };
  }, []),
);
```

**Fix:** Keep only the cleanup (it runs on unfocus, which is the important time):
```tsx
useFocusEffect(
  useCallback(() => {
    return () => {
      void stopReaderPlayback();
    };
  }, []),
);
```

**Rationale:** The initial call on focus is unnecessary — audio should already be stopped when leaving the reader. The cleanup on unfocus is the safety net.

**Step 1: Commit**

```bash
git add app/save-load.tsx app/settings.tsx
git commit -m "fix: remove redundant stopReaderPlayback calls in useFocusEffect"
```

---

### Task 2.9: Add "Reset to defaults" in Settings

**Objective:** Add a button to reset all settings to default values.

**Files:**
- Modify: `app/settings.tsx` (add reset button)

**Step 1: Add reset button in the About section**

In the "About" section, after the version text:
```tsx
<Button
  variant="ghost"
  size="sm"
  onPress={() => {
    Alert.alert(
      t('settings.resetTitle'),
      t('settings.resetConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          onPress: () => updateSettings(defaultUserSettings),
        },
      ],
    );
  }}
  accessibilityLabel={t('settings.resetButton')}
>
  {t('settings.resetButton')}
</Button>
```

**Step 2: Import defaultUserSettings**

```tsx
import { defaultUserSettings } from '@/lib/user-settings';
```

**Step 3: Add i18n keys**

```json
{
  "settings.resetTitle": "Reset Settings",
  "settings.resetConfirm": "Reset all settings to default values?",
  "settings.resetButton": "Reset to Defaults"
}
```

**Step 4: Commit**

```bash
git add app/settings.tsx lib/translations/
git commit -m "feat: add 'Reset to defaults' button in Settings"
```

---

### Task 2.10: Remove emoji from Settings section headers (optional, low priority)

**Objective:** Replace emoji in settings section headers with clean text or IconSymbol for a more professional look.

**Files:**
- Modify: `app/settings.tsx:147,152,164,201,212`

**Replace:**
```
🌐  ${t('settings.language')}  →  ${t('settings.language')}
🔊  ${t('settings.audio')}    →  ${t('settings.audio')}
✏️  ${t('settings.textSection')} →  ${t('settings.textSection')}
▶️  ${t('settings.playbackSection')} →  ${t('settings.playbackSection')}
ℹ️  ${t('settings.aboutSection')}  →  ${t('settings.aboutSection')}
```

**Step 1: Commit**

```bash
git add app/settings.tsx
git commit -m "refactor: remove emoji from settings section headers"
```

---

### Task 2.11: Fix minHeight on document editor pages

**Objective:** Remove fixed `minHeight` on document pages that creates artificial "page" feel. Replace with bottom padding.

**Files:**
- Search and modify: `components/document-editor/DocumentSceneEditor.tsx` — find `minHeight` usage

**Step 1: Find minHeight usage**

Run: `grep -n "minHeight\|pageMinHeight\|520" components/document-editor/DocumentSceneEditor.tsx`

**Step 2: Replace minHeight with paddingBottom**

Find pages with `minHeight: ...` and replace:
```tsx
// Before:
minHeight: Math.max(520, screenHeight - insets - 74),

// After:
paddingBottom: 120,
```

**Step 3: Replace page gap with divider line**

Find `marginBottom: 24` or similar gap between pages and replace:
```tsx
// Before:
marginBottom: 24,

// After:
borderBottomWidth: 1,
borderBottomColor: colors['border-subtle'] ?? colors.border,
```

**Step 4: Commit**

```bash
git add components/document-editor/DocumentSceneEditor.tsx
git commit -m "fix: remove minHeight on document pages, use paddingBottom + divider instead"
```

---

### Task 2.12: Fix CharacterDisplay fallback image

**Objective:** Replace inline base64 1px PNG with proper null/conditional rendering.

**Files:**
- Modify: `components/CharacterDisplay.tsx:30-31`

**Current:**
```tsx
source={spriteUri ? { uri: spriteUri } : { uri: 'data:image/png;base64,iVBORw0KGgo...' }}
```

**Step 1: Replace with conditional rendering**

```tsx
{spriteUri ? (
  <Image
    source={{ uri: spriteUri }}
    style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: screenHeight * 0.65 }}
    resizeMode="contain"
  />
) : (
  <View style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: screenHeight * 0.65 }} />
)}
```

**Step 2: Commit**

```bash
git add components/CharacterDisplay.tsx
git commit -m "fix: replace base64 fallback image with conditional rendering"
```

---

## Wave 3: 🔵 Low Priority + 💡 Features (18 issues)

> **Estimated time:** ~3-4 hours
> **Risk:** Low — cosmetic and feature additions

---

### Task 3.1: Decompose StoryReaderResponsive

**Objective:** Split the 607 LOC God Component into manageable sub-components.

**Files to create:**
- `components/reader/ReaderDisplay.tsx` — background + characters
- `components/reader/ReaderControls.tsx` — auto-play, history, skip buttons
- `components/reader/ReaderDialogue.tsx` — speaker + text + typewriter
- `components/reader/ReaderChoices.tsx` — choice list
- `components/reader/ReaderTransitions.tsx` — fade/slide animations
- Modify: `components/story-reader-responsive.tsx` — becomes orchestrator (~150 LOC)

**Step 1: Create ReaderDisplay**

```tsx
// components/reader/ReaderDisplay.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/use-colors';
import type { CharacterRuntimeState } from '@/lib/engine/types';
import { CharacterDisplay } from '@/components/CharacterDisplay';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

interface ReaderDisplayProps {
  bgSource: { uri: string } | null;
  characters: CharacterRuntimeState[];
  resolvedCharUris: Record<string, { uri: string } | string>;
  sceneOpacity: ReturnType<typeof useSharedValue<number>>;
  bgScale: ReturnType<typeof useSharedValue<number>>;
  isPortrait: boolean;
  dialogueHeight: number;
  screenHeight: number;
}

export function ReaderDisplay({
  bgSource,
  characters,
  resolvedCharUris,
  sceneOpacity,
  bgScale,
  isPortrait,
  dialogueHeight,
  screenHeight,
}: ReaderDisplayProps) {
  const colors = useColors();

  const bgAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value,
    transform: [{ scale: bgScale.value }],
  }));

  const charactersAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value,
  }));

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFillObject, bgAnimatedStyle]}>
        {bgSource ? (
          <Image
            source={bgSource}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            transition={300}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.background }]} />
        )}
      </Animated.View>

      {Object.keys(resolvedCharUris).length > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            charactersAnimatedStyle,
            {
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'flex-end',
              paddingBottom: isPortrait ? dialogueHeight - 20 : 0,
              ...getPointerEventsStyle('none'),
            },
          ]}
        >
          {characters.map((char) => {
            const charId = char.characterId;
            const charSource = resolvedCharUris[charId];
            if (!charSource) return null;
            const uri = typeof charSource === 'string' ? charSource : (charSource as { uri: string }).uri;
            return (
              <CharacterDisplay
                key={charId}
                instance={{
                  id: charId,
                  characterId: charId,
                  spriteId: '',
                  position: 'center' as const,
                  zIndex: 0,
                  animatedOpacity: char.opacity,
                  animatedTranslateX: 0,
                  animatedTranslateY: 0,
                  animatedScale: char.scale,
                }}
                spriteUri={uri}
              />
            );
          })}
        </Animated.View>
      )}
    </>
  );
}
```

**Step 2: Create ReaderControls**

Extract the top-right control buttons (auto-play, history) into a separate component.

**Step 3: Create ReaderDialogue**

Extract the dialogue box (speaker nameplate, text, choices) into a separate component.

**Step 4: Create ReaderChoices**

Extract the choices list into a separate component.

**Step 5: Wire up in StoryReaderResponsive**

StoryReaderResponsive becomes the orchestrator that combines all sub-components and manages shared state.

**Step 6: Commit**

```bash
git add components/reader/ components/story-reader-responsive.tsx
git commit -m "refactor: decompose StoryReaderResponsive into 5 sub-components"
```

---

### Task 3.2: Decompose DocumentSceneEditor (partial)

**Objective:** Extract at least the toolbar and command search into separate files.

**Files to create:**
- `components/document-editor/DocumentToolbar.tsx` — save, navigation, scene buttons
- `components/document-editor/DocumentCommands.tsx` — command search/palette

**Step 1: Create DocumentToolbar**

Extract the top bar with save button, scene navigation, and scene creation buttons.

**Step 2: Create DocumentCommands**

Extract the `/` command palette with block insertion.

**Step 3: Commit**

```bash
git add components/document-editor/DocumentToolbar.tsx components/document-editor/DocumentCommands.tsx
git commit -m "refactor: extract DocumentToolbar and DocumentCommands from DocumentSceneEditor"
```

---

### Task 3.3: Distinguish between PlayMode and Reader as separate features

**Objective:** Make PlayMode use the same screen as Reader but with a `mode=quick` parameter.

**Analysis:** This is a larger refactor. For now, document the distinction:
- `/reader` — full-featured reader with history, menu, save/load access
- `/play` — quick play mode for testing (no history, no menu)

**Decision:** Add a comment/label header to each route explaining when to use it. Don't merge yet — requires more analysis.

**Files:**
- Modify: `app/play.tsx` — add header comment
- Modify: `app/reader.tsx` — add header comment

**Step 1: Add distinguishing headers**

```tsx
// app/play.tsx — Quick Play Mode (no history, no menu, for testing scenes)
// app/reader.tsx — Full Reader Mode (history, settings, save/load)
```

**Step 2: Commit**

```bash
git add app/play.tsx app/reader.tsx
git commit -m "docs: clarify distinction between PlayMode and Reader routes"
```

---

## Verification Steps (After Each Wave)

### After Wave 1:
1. `npx tsc --noEmit` — 0 errors (if it hangs >120s, it's WSL/NTFS, not code)
2. `grep -rn "?? '#ffffff'\|?? '#fff'" --include='*.tsx' components/ hooks/ app/` — 0 results
3. `grep -rn "dialogueTop" --include='*.tsx' components/` — 0 results
4. `grep -rn "new.*Animated.Value" components/story-reader-responsive.tsx` — 0 results

### After Wave 2:
1. `grep -rn "rgba(0,0,0,0.45)\|rgba(255,255,255,0.18)" --include='*.tsx' components/` — 0 results
2. `grep -rn "accessibilityLabel" components/InteractiveObjectsLayer.tsx` — >0 results (new a11y)

### After Wave 3:
1. `wc -l components/story-reader-responsive.tsx` — should be ~200 LOC (down from 607)
2. `ls components/reader/` — 5 new files
3. `npx tsc --noEmit` — 0 errors

---

## Summary

| Wave | Tasks | LOC Impact | Risk |
|------|-------|------------|------|
| 1 — Critical | 5 | ~50 LOC changed | Low |
| 2 — Important | 12 | ~100 LOC changed | Medium |
| 3 — Low/Feature | 3+ | ~500 LOC restructured | Medium |
| **Total** | **20+** | **~650 LOC** | **Medium** |

---

## Пов'язані сторінки

[[ux-ui-analysis-2026-06-01|UX/UI Аудит — повний звіт]]
[[bug-patterns-vne|Баг-паттерни VNE]]
[[code-analysis-report-2026-05-31|Останній аудит коду]]
[[2026-05-31-fix-critical-issues|План виправлень критичних проблем]]
