# Phase 7: Editor UX Polish — Research

**Researched:** 2026-05-25
**Domain:** Editor UX — undo/redo wiring, keyboard shortcuts, confirmation dialogs, loading states, error boundaries
**Confidence:** HIGH

## Summary

Phase 7 is a pure presentation-layer effort. All infrastructure for undo/redo and keyboard shortcuts already exists and is validated — only UI wiring is missing. Error handling is already present globally but needs editor-specific isolation. Loading states and confirmation dialogs require new component creation following existing modal patterns in the codebase.

**Primary recommendation:** Five independent modifications all centered on `SceneComposer.tsx` — add undo/redo buttons to both phone and desktop layouts, call the ready keyboard shortcuts hook, wrap delete operations with a new ConfirmDialog, add a saving state indicator, and wrap the editor with its own ErrorBoundary for targeted error recovery.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLISH-01 | Undo/Redo buttons | Store infra VALIDATED (Spike 002, 10 tests). SceneComposer imports `undo`, `redo`, `selectCanUndo`, `selectCanRedo` at lines 48/52-53 but never renders. Only UI placement needed. |
| POLISH-02 | Keyboard shortcuts | Hook at `hooks/useKeyboardShortcuts.ts` validated (Spike 004). 10 shortcuts mapped. Must import and call in SceneComposer. Platform-guarded (web only). |
| POLISH-03 | Delete confirmation dialog | NO existing ConfirmDialog. Must create at `components/ui/ConfirmDialog.tsx`. Delete flows through `removeBlock` passed to TimelinePanel (line 130) and PropertiesPanel (line 189). |
| POLISH-04 | Loading states during save/load | NO `isLoading` flag in editor store. `saveSceneRecord` is synchronous Zustand set() — no async loading. Must add saving state indicator (transient UX feedback). |
| POLISH-05 | ErrorBoundary wrapping | ErrorBoundary exists at `components/ErrorBoundary.tsx` and wraps entire app in `app/_layout.tsx:38`. Need editor-specific wrapper for targeted fallback. |
</phase_requirements>

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions
- Store infrastructure (`_undoStack`, `_redoStack`, `undo()`, `redo()`, `selectCanUndo`, `selectCanRedo`) already exists and is VALIDATED — only UI buttons need adding
- `hooks/useKeyboardShortcuts.ts` already written and validated — must add `useKeyboardShortcuts(...)` call in SceneComposer
- Platform-guarded keyboard shortcuts: only fires on web
- Create lightweight ConfirmDialog modal — no existing component
- Add loading overlay or inline indicators — source from editor store (may need `isLoading` flag)
- ErrorBoundary already exists — must wrap editor components: SceneComposer (BlockEditor not found in codebase)

### the agent's Discretion
- Undo/redo button placement: phone bottom action bar, desktop header toolbar
- Icons: ↩ (undo), ↪ (redo) or custom simple text icons
- Disabled state: opacity 0.3
- ConfirmDialog API shape: `visible`, `title`, `message`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, `destructive`
- ErrorBoundary fallback: inline error with retry button

### Deferred Ideas (OUT OF SCOPE)
- Tooltip modals — partially referenced in ROADMAP but no concrete requirements
- Advanced keyboard shortcuts beyond the basic set — future expansion
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Undo/Redo buttons | Client (Editor UI) | Store logic already complete | Store actions and selectors done; only view-layer rendering missing |
| Keyboard shortcuts | Client (Editor UI) | — | `window.addEventListener('keydown')` — web-only DOM interaction |
| Delete confirmation | Client (Editor UI) | — | Modal dialog blocks destructive `removeBlock` call until confirmed |
| Loading state indicator | Client (Editor UI) | Store may grow `isSaving` | Transient UX feedback; Zustand set() is sync, no async loading |
| Error boundary | Client (Editor UI) | — | React ErrorBoundary wrapping editor subtree for isolated fallback |

## Standard Stack

### Core — Already in project
| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| React Native `Modal` | built-in | Dialog/overlay component | [VERIFIED: codebase scan — SaveSceneDialog, SceneSelector, BlockLibraryPanel, CharacterCreator all use Modal] |
| `useColors()` | project-local | Theme color hook | [VERIFIED: used in all editor components] |
| `Pressable` | react-native | Touchable for buttons/actions | [VERIFIED: pattern throughout SceneComposer] |
| Zustand `useEditorStore` | project-local | Undo/redo actions + selectors | [VERIFIED: store scan, Spike 002 validation] |

### New components to create
| Component | Purpose | File Location |
|-----------|---------|---------------|
| `ConfirmDialog` | Modal confirmation for destructive actions | `components/ui/ConfirmDialog.tsx` |

### Supporting
| File | Purpose | What to add |
|------|---------|-------------|
| `components/editor/SceneComposer.tsx` | Main editor component | Undo/redo buttons, keyboard shortcuts call, confirmation state, saving indicator, ErrorBoundary |
| `components/editor/PropertiesPanel.tsx` | Block properties + delete button | Delete must route through confirmation (SceneComposer manages state) |
| `components/editor/TimelinePanel.tsx` | Timeline with block remove buttons | Remove must route through confirmation (SceneComposer manages state) |
| `stores/use-editor-store.ts` | Editor store | May add `isSaving` boolean, `setIsSaving` action |

## Package Legitimacy Audit

> No external packages are required for this phase. All work uses existing project dependencies (React Native, Zustand, Expo) and new project-local components.

**Packages removed due to slopcheck [SLOP] verdict:** N/A
**Packages flagged as suspicious [SUS]:** N/A

## Architecture Patterns

### Existing Modal Pattern (for ConfirmDialog)

All modal dialogs in the codebase follow this pattern:
```tsx
import { Modal } from 'react-native';
import { useColors } from '@/hooks/use-colors';

// Inside component:
<Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
  <View style={{
    flex: 1,
    backgroundColor: colors.backdrop || 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  }}>
    <View style={{
      width: '90%',
      maxWidth: 400,
      backgroundColor: colors['surface-container'] || colors.surface,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header: title + close */}
      {/* Body: message */}
      {/* Footer: action buttons */}
    </View>
  </View>
</Modal>
```

Sources: `SaveSceneDialog.tsx:60-72`, `BlockLibraryPanel.tsx:189`, `CharacterCreator.tsx`

### Existing Styling Pattern

All styles are inline objects. No `className` usage. `Pressable` uses `remapProps(Pressable, { className: false })` pattern project-wide. Buttons use `style={({ pressed }) => ({...})}` for press states.

```tsx
<Pressable
  onPress={handler}
  disabled={condition}
  style={{ opacity: condition ? 0.3 : 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
>
  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Label</Text>
</Pressable>
```

Source: `SceneComposer.tsx:149-159`, `TimelinePanel.tsx:150-170`

### State Management Pattern for Confirmation

Delete confirmation requires blocking a store action with user input. The pattern is a local `useState` for pending state:
```tsx
const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

const handleDeleteConfirm = useCallback(() => {
  if (pendingDeleteId) removeBlock(pendingDeleteId);
  setPendingDeleteId(null);
}, [pendingDeleteId, removeBlock]);

// Pass to TimelinePanel/PropertiesPanel:
<PropertiesPanel 
  onDelete={() => setPendingDeleteId(block.id)}  // Was: removeBlock(block.id)
  // ...
/>
```

### ErrorBoundary Wrapping Pattern

The existing ErrorBoundary accepts a `fallback` prop for custom error UI:
```tsx
<ErrorBoundary fallback={(error, errorInfo, reset) => <CustomUI />}>
  <SceneComposer ... />
</ErrorBoundary>
```

Source: `ErrorBoundary.tsx:8-10`

### Anti-Patterns to Avoid
- **Removing props from existing components:** Don't change `onBlockRemove` in TimelinePanel or `onDelete` in PropertiesPanel signatures — they still call the passed handler. Just pass a wrapped handler from SceneComposer.
- **Adding loading logic to sync operations:** `saveSceneRecord` is synchronous. Adding true async loading would be misleading. Instead, use a brief transient "saved" indicator (500ms-1s).
- **Nested ErrorBoundaries without fallbacks:** Avoid stacking ErrorBoundaries without clear fallback UIs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal dialogs | Custom overlay from scratch | React Native `Modal` | Already the established pattern in project; handles animation, transparency, backdrop press |
| Error catching | try/catch in every component | React ErrorBoundary | Already exists at `components/ErrorBoundary.tsx` — supports custom fallback, retry, error reporting |

## Runtime State Inventory

> Not applicable — this is not a rename/refactor/migration phase. No runtime state changes.

## Common Pitfalls

### Pitfall 1: Confirmation Dialog Blocks All Deletes
**What goes wrong:** Adding confirmation dialog that pops up for every delete action, creating friction for power users.
**Why it happens:** Wrapping `removeBlock` at the store level instead of the UI level.
**How to avoid:** Keep confirmation at the UI level (SceneComposer state). Only blocks triggered by keyboard shortcuts (Delete/Backspace via POLISH-02) also need confirmation — debounce if needed.
**Warning signs:** User testing feedback about too many clicks to delete.

### Pitfall 2: Keyboard Shortcuts Fire During Text Input
**What goes wrong:** Ctrl+S in a TextInput triggers save and also triggers window-level shortcut.
**Why it happens:** TextInput keydown event bubbles to window.
**How to avoid:** The spike (Spike 004) confirmed this doesn't happen — TextInput captures keydown at element level before window. But verify during implementation.
**Warning signs:** Save fires when typing text in search input.

### Pitfall 3: Re-registering Keyboard Shortcut Listener on Every Render
**What goes wrong:** The `useKeyboardShortcuts` hook re-adds `window.addEventListener` every render.
**Why it happens:** If shortcuts object is recreated each render.
**How to avoid:** The spike already uses `useRef` pattern (`shortcutsRef`) — no re-registration. Confirmed in `use-keyboard-shortcuts.ts:14-15`.
**Warning signs:** Multiple handlers firing per keypress.

### Pitfall 4: Overriding `handleSave` Callback Reference
**What goes wrong:** Keyboard shortcuts call a stale `handleSave` reference if the callback changes.
**Why it happens:** The `useKeyboardShortcuts` hook reads from `shortcutsRef.current`, which is updated via `useRef` assignment — always current. But the `handleSave` dependency chain in SceneComposer (`[storyId, sceneId, sceneName, timeline]`) means it's recreated often. The ref pattern handles this.
**How to avoid:** Trust the `useRef` pattern. Don't memoize the shortcut map — the ref pattern ensures freshness.
**Warning signs:** Save shortcut saves old data.

## Code Examples

### Undo/Redo Button Integration (Phone + Desktop)

```tsx
// In SceneComposer.tsx, after existing store destructuring (line 48-49):
const undo = useEditorStore((s) => s.undo);
const redo = useEditorStore((s) => s.redo);
const canUndo = useEditorStore(selectCanUndo);
const canRedo = useEditorStore(selectCanRedo);

// Phone layout — add to bottom action bar (after line 192, before SceneSelector):
/* Undo/Redo buttons for phone */
<View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, gap: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
  <Pressable onPress={undo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3, padding: 8 }}>
    <Text style={{ color: colors.primary, fontSize: 16 }}>↩</Text>
  </Pressable>
  <Pressable onPress={redo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.3, padding: 8 }}>
    <Text style={{ color: colors.primary, fontSize: 16 }}>↪</Text>
  </Pressable>
</View>

// Desktop layout — add to header toolbar (after line 224, before closing </View>):
<View style={{ flexDirection: 'row', gap: 8, marginRight: 12 }}>
  <Pressable onPress={undo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
    <Text style={{ color: colors.foreground, fontSize: 12 }}>↩ Undo</Text>
  </Pressable>
  <Pressable onPress={redo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
    <Text style={{ color: colors.foreground, fontSize: 12 }}>↪ Redo</Text>
  </Pressable>
</View>
```

### Keyboard Shortcuts Integration

```tsx
// In SceneComposer.tsx, add import:
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

// Add inside SceneComposer function body (after handleConnectScenes, before the return):
const searchInputRef = useRef<TextInput>(null); // For Ctrl+A focusing

useKeyboardShortcuts({
  'Ctrl+Z':       undo,
  'Ctrl+Shift+Z': redo,
  'Ctrl+Y':       redo,
  'Delete':       () => selectedBlockId && setPendingDeleteId(selectedBlockId),
  'Backspace':    () => selectedBlockId && setPendingDeleteId(selectedBlockId),
  'Ctrl+D':       () => selectedBlockId && duplicateBlock(selectedBlockId),
  'Ctrl+S':       handleSave,
  'Escape':       () => selectBlock(null),
  'Ctrl+P':       handlePreview,
  'Ctrl+A':       () => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus(),
});
```

Source: `use-keyboard-shortcuts.ts:57-68`

### ConfirmDialog Component

```tsx
// components/ui/ConfirmDialog.tsx
import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useColors } from '@/hooks/use-colors';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = true,
}: ConfirmDialogProps) {
  const colors = useColors();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={{
        flex: 1,
        backgroundColor: colors.backdrop || 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <View style={{
          width: '85%',
          maxWidth: 360,
          backgroundColor: colors['surface-container'] || colors.surface,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground, marginBottom: 8 }}>
              {title}
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>
              {message}
            </Text>
          </View>
          <View style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 8,
          }}>
            <Pressable
              onPress={onCancel}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: destructive ? (colors.error || '#ff6b6b') : colors.primary }}
            >
              <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

Pattern source: `SaveSceneDialog.tsx:60-72`, `BlockLibraryPanel.tsx:189-245`

### ErrorBoundary Wrapping (scene-editor.tsx)

```tsx
// In app/scene-editor.tsx, wrap SceneComposer:
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Replace:
// <SceneComposer ... />
// With:
<ErrorBoundary>
  <SceneComposer ... />
</ErrorBoundary>
```

Or with custom fallback:
```tsx
<ErrorBoundary fallback={(error, errorInfo, reset) => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
    <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.danger, marginBottom: 12 }}>
      Editor Error
    </Text>
    <Pressable onPress={reset} style={{ padding: 12, borderRadius: 8, backgroundColor: colors.primary }}>
      <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
    </Pressable>
  </View>
)}>
  <SceneComposer ... />
</ErrorBoundary>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No undo/redo | Zustand snapshot-based undo/redo | Spike 002 (pre-Phase 7) | 100-depth undo stack, all actions captured |
| No keyboard shortcuts | `useKeyboardShortcuts` hook | Spike 004 (pre-Phase 7) | 10 shortcuts, web-only, ref-based |
| Global ErrorBoundary only | Global + editor-specific ErrorBoundary | Phase 7 | Editor errors show editor fallback, not whole-app fallback |
| Direct delete (no confirm) | Delete with confirmation | Phase 7 | Blocks dialog first, then deletes |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `saveSceneRecord` in use-app-store.ts is synchronous | Standard Stack | LOW — confirmed by code inspection (Zustand `set()` at line 401-410) |
| A2 | TextInput keydown events don't trigger window-level keyboard shortcuts | Common Pitfalls | MEDIUM — stated in Spike 004 but not verified with this project's TextInput usage; test during implementation |
| A3 | BlockEditor.tsx does not exist in codebase | User Constraints | LOW — confirmed via glob; CONTEXT.md references it but it's not in the repo |
| A4 | `handleSave` and `handlePreview` callbacks will be stable references for useKeyboardShortcuts | Code Examples | LOW — useRef pattern in hook ensures fresh references regardless |
| A5 | `colors.backdrop` is available in all theme contexts | Architecture Patterns | MEDIUM — `SaveSceneDialog.tsx:63` uses it, `CharacterCreator.tsx` pattern |
| A6 | The `data-search-input` attribute exists on search elements for Ctrl+A focusing | Code Examples | LOW — must ensure BlockLibraryPanel search input has this attribute |

## Open Questions (RESOLVED)

1. **What does "loading state for save" actually mean if save is sync?**
   - What we know: `saveSceneRecord` is a Zustand `set()` call — no async, no network, no delay.
   - What's unclear: Should we add an artificial delay indicator (e.g., show "Saved!" text for 500ms after save) or add a saving state flag? The POLISH-04 requirement says "loading overlay or inline indicators during open/save."
   - Recommendation: Add `isSaving` to the editor store, set to true before save, false after save (with setTimeout for UX). Show mini-indicator in header. This gives a visual acknowledgment that save happened without misleading users about actual loading.

2. **Should delete via keyboard shortcut (Delete/Backspace) also show confirmation?**
   - What we know: Confirmation is for "block removal, scene deletion" per CONTEXT.md.
   - What's unclear: Should pressing Delete on keyboard also show the dialog? It would break power-user flow.
   - Recommendation: Yes, show confirmation for keyboard delete too — consistency. Power users can press Enter to confirm quickly.

3. **Where exactly to place undo/redo buttons on phone layout?**
   - What we know: "Phone: bottom action bar (alongside block add buttons)" per CONTEXT.md
   - What's unclear: The phone layout currently has tab-switching at top (lines 162-175) and the block/timeline/properties content below. There's no "bottom action bar" currently.
   - Recommendation: Add undo/redo as a separate bar at the bottom of the screen (above SceneSelector modal), matching the phone UX pattern of a bottom toolbar.

## Environment Availability

> Skip condition met: Phase 7 is purely code changes to existing project files. No external tools, services, or runtime dependencies beyond what the project already requires (Node, Expo, React Native packages already installed).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter dot` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLISH-01 | Undo/redo buttons render correctly | manual / component test | n/a (UI-only) | ❌ — manual QA |
| POLISH-02 | Keyboard shortcuts trigger correct actions | integration | `npx vitest run .planning/spikes/004-keyboard-shortcuts/test-keyboard-shortcuts.ts` | ❌ Wave 0 |
| POLISH-03 | ConfirmDialog prevents accidental delete | unit | `npx vitest run components/ui/__tests__/ConfirmDialog.test.tsx` | ❌ Wave 0 |
| POLISH-04 | Saving indicator shows feedback | manual | n/a (visual only) | ❌ — manual QA |
| POLISH-05 | ErrorBoundary catches editor errors | integration | `npx vitest run components/editor/__tests__/ErrorBoundary.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter dot`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `components/ui/__tests__/ConfirmDialog.test.tsx` — covers POLISH-03: renders modal, confirm/cancel callbacks
- [ ] `components/editor/__tests__/ErrorBoundary-wrapping.test.tsx` — covers POLISH-05: catches errors in child, shows retry

## Security Domain

> Security enforcement not configured in project config. Omitted as all work is UI-layer presentation polish with no authentication, input processing, or data handling changes.

## Sources

### Primary (HIGH confidence)
- Codebase scan of `stores/use-editor-store.ts` — undo/redo infrastructure complete
- Codebase scan of `components/editor/SceneComposer.tsx` — target file for all integrations
- Codebase scan of `components/ErrorBoundary.tsx` — existing error boundary
- Codebase scan of `app/scene-editor.tsx` — parent route for ErrorBoundary wrapping
- Codebase scan of `components/editor/modals/SaveSceneDialog.tsx` — modal dialog pattern
- Codebase scan of `components/editor/TimelinePanel.tsx` — delete button flow
- Codebase scan of `components/editor/PropertiesPanel.tsx` — delete button flow
- Spike 002: `.planning/spikes/002-editor-undo-redo/README.md` — undo/redo validation
- Spike 004: `.planning/spikes/004-keyboard-shortcuts/README.md` + `use-keyboard-shortcuts.ts` — shortcuts hook

### Tertiary (LOW confidence)
- `colors.backdrop` theme key — used in SaveSceneDialog but may not be present in all themes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components and patterns verified via codebase scan
- Architecture: HIGH — integration points documented from actual file contents
- Pitfalls: HIGH — verified against spike findings and codebase patterns

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (30 days — stable project patterns)
