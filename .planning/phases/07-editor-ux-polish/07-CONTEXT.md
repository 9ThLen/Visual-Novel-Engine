# Phase 7: Editor UX Polish — Context

**Gathered:** 2026-05-25
**Status:** Ready for planning
**Source:** ROADMAP + Spikes 002/004 + codebase analysis

<domain>
## Phase Boundary

Improve editor UX by wiring existing but invisible undo/redo infrastructure, integrating the ready keyboard shortcuts hook, and adding missing UX safety nets: confirmation dialogs for destructive actions, loading states, and ErrorBoundary wrapping.

This phase touches only the **presentation layer** of the editor. Store logic, data flow, and runtime remain unchanged.

</domain>

<decisions>
## Implementation Decisions

### Undo/Redo Buttons (POLISH-01)
- Store infrastructure (`_undoStack`, `_redoStack`, `undo()`, `redo()`, `selectCanUndo`, `selectCanRedo`) already exists and is VALIDATED (Spike 002)
- `SceneComposer.tsx` already imports `undo`, `redo`, `selectCanUndo`, `selectCanRedo` but never renders them
- Only UI buttons need to be added: phone toolbar and desktop header
- Buttons disabled when canUndo/canRedo is false

### Keyboard Shortcuts (POLISH-02)
- `hooks/useKeyboardShortcuts.ts` already written and validated (Spike 004)
- Shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo), Delete/Backspace (remove), Ctrl+D (duplicate), Ctrl+S (save), Escape (deselect), Ctrl+P (preview), Ctrl+A (focus search)
- Must add `useKeyboardShortcuts(...)` call in `SceneComposer.tsx`
- Platform-guarded: only fires on web

### Delete Confirmation Dialog (POLISH-03)
- No existing ConfirmDialog component for block/scene deletion
- Must create a lightweight modal component
- Dialog appears before: block removal, scene deletion
- Standard "Cancel" / "Delete" buttons

### Loading States (POLISH-04)
- No loading indicators currently in SceneComposer during open/save
- Must add loading overlay or inline indicators
- Source: `useEditorStore` already has `isDirty` but no loading flag — may need `isLoading` or equivalent
- Also covers save/load progress indication

### ErrorBoundary (POLISH-05)
- `components/ErrorBoundary.tsx` already exists (class component with fallback UI)
- Must wrap editor components: `SceneComposer`, `BlockEditor` (or their parent)
- Fallback UI with retry capability

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core editor store
- `stores/use-editor-store.ts` — undo/redo infrastructure, selectors
- `components/editor/SceneComposer.tsx` — main editor component, target for all integrations

### Spike findings (validated)
- `.planning/spikes/002-editor-undo-redo/README.md` — Undo/redo spike: store infrastructure is complete, only UI wiring missing
- `.planning/spikes/002-editor-undo-redo/test-undo-redo.ts` — 10 passing tests confirming undo/redo correctness
- `.planning/spikes/004-keyboard-shortcuts/README.md` — Keyboard shortcuts validated: hook ready
- `.planning/spikes/004-keyboard-shortcuts/use-keyboard-shortcuts.ts` — Ready-to-use hook with all shortcuts

### Existing components
- `components/ErrorBoundary.tsx` — Already exists, needs to wrap editor

### State and roadmap
- `.planning/STATE.md` — Project state and phase tracking
- `.planning/ROADMAP.md` — Phase 7 details and success criteria
- `.planning/REQUIREMENTS.md` — POLISH-01 through POLISH-05

</canonical_refs>

<specifics>
## Specific Ideas

### Undo/redo button placement
- Phone: bottom action bar (alongside block add buttons)
- Desktop: header toolbar area
- Icons: ↩ (undo), ↪ (redo) or custom icons
- Disabled state: opacity 0.3

### Keyboard shortcuts integration in SceneComposer
```typescript
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

// Inside SceneComposer:
useKeyboardShortcuts({
  'Ctrl+Z':       undo,
  'Ctrl+Shift+Z': redo,
  'Ctrl+Y':       redo,
  'Delete':       () => selectedBlockId && removeBlock(selectedBlockId),
  'Backspace':    () => selectedBlockId && removeBlock(selectedBlockId),
  'Ctrl+D':       () => selectedBlockId && duplicateBlock(selectedBlockId),
  'Ctrl+S':       handleSave,
  'Escape':       () => selectBlock(null),
  'Ctrl+P':       handlePreview,
  'Ctrl+A':       () => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus(),
});
```

### ConfirmDialog API
```typescript
interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;    // default "Delete"
  cancelLabel?: string;     // default "Cancel"
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;    // highlights confirm as destructive action
}
```

### ErrorBoundary wrapping
- `SceneComposer` already at `components/editor/SceneComposer.tsx`
- Wrap in `<ErrorBoundary>` at the route level or component level
- Fallback: inline error with retry button

</specifics>

<deferred>
## Deferred Ideas
- Tooltip modals — partially referenced in ROADMAP but no concrete requirements or existing work
- Advanced keyboard shortcuts beyond the basic set — future expansion

</deferred>

---

*Phase: 07-editor-ux-polish*
*Context gathered: 2026-05-25 from ROADMARK + Spikes 002/004 + codebase scan*
