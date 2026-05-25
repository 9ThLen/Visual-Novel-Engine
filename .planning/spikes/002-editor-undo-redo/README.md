---
spike: 002
name: editor-undo-redo
type: standard
validates: "Given a timeline with edits, when user performs undo, then the previous state is restored without data loss"
verdict: VALIDATED
related: [004]
tags: [editor, ux, undo, redo, timeline]
---

# Spike 002: Editor Undo/Redo

## What This Validates

That undo/redo works correctly across all timeline mutation operations (add, remove, move, duplicate, update, clear) and that the existing store infrastructure is complete and reliable.

## Research

### Discovery

The undo/redo infrastructure is **already implemented** in `stores/use-editor-store.ts`:

- **`_undoStack: TimelineStep[][]`** — array of previous timeline snapshots (lines 29)
- **`_redoStack: TimelineStep[][]`** — array of future timeline snapshots (lines 30)
- **`MAX_UNDO_HISTORY = 100`** — bounds the undo stack (line 11)
- **`undo()`** — pops undo stack, pushes current to redo, restores previous timeline (lines 190-200)
- **`redo()`** — pops redo stack, pushes current to undo, restores next timeline (lines 202-212)
- **`selectCanUndo`** / **`selectCanRedo`** — selectors for button enablement (lines 251-255)

Every mutation action (`addBlock`, `removeBlock`, `moveBlock`, `duplicateBlock`, `updateBlock`, `clearTimeline`) already pushes the previous timeline to `_undoStack` and clears `_redoStack`.

### Missing: UI Wiring

The store actions and selectors are **imported in `SceneComposer.tsx`** (lines 12-13, 47, 51-52) but **never rendered in the JSX**. There are no undo/redo buttons in either the phone or desktop layout.

## How to Run

```bash
cd visual_novel_engine
npx vitest run .planning/spikes/002-editor-undo-redo/test-undo-redo.ts
```

## What to Expect

All 10 tests pass, confirming:
- Undo restores previous timeline after add/remove/move/duplicate/update/clear
- Redo restores after undo
- New actions clear the redo stack
- Empty undo is a no-op
- MAX_UNDO_HISTORY bound works
- Selectors reflect correct state

## Investigation Trail

1. **Initial expectation:** Need to build undo/redo from scratch.
2. **Realization:** The store already has full undo/redo infrastructure — `_undoStack`, `_redoStack`, `undo()`, `redo()`, `selectCanUndo`, `selectCanRedo`.
3. **Wrote 10 unit tests** covering all 6 mutation operations + edge cases.
4. **All tests pass.** The store implementation is correct and complete.
5. **UI gap confirmed:** `SceneComposer.tsx` imports `undo`, `redo`, `selectCanUndo`, `selectCanRedo` but never uses them in JSX.

## Results

**Verdict: VALIDATED** ✓

The undo/redo logic works correctly for all timeline mutation operations. The spike reveals that the **infrastructure is complete — only the UI buttons are missing**.

### Key Findings

1. **Full undo/redo store implementation exists.** `_undoStack`/`_redoStack` with snapshot-based approach.
2. **All 6 mutation actions properly capture history.** addBlock, removeBlock, moveBlock, duplicateBlock, updateBlock, clearTimeline.
3. **MAX_UNDO_HISTORY (100) is reasonable** for a timeline editor. No perf issues expected with snapshot-based approach since TimelineStep arrays are typically small (tens to low hundreds).
4. **Only 3 things are needed to wire the UI:**
   - Two buttons in the toolbar (phone: action bar, desktop: header bar)
   - Bind `undo`/`redo` to Ctrl+Z / Ctrl+Shift+Z (handled in Spike 004)
   - Disable buttons when `canUndo`/`canRedo` is false

### UI Integration Suggestion

```tsx
{/* In the toolbar area */}
<Pressable onPress={undo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3 }}>
  <Text>↩ Undo</Text>
</Pressable>
<Pressable onPress={redo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.3 }}>
  <Text>↪ Redo</Text>
</Pressable>
```
