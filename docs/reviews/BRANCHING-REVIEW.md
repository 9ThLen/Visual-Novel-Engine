---
status: changes_requested
review_depth: deep
scope: in-scene branching (label/goto/if-else)
files_reviewed:
  - lib/engine/types.ts
  - lib/engine/event-factory.ts
  - lib/engine/useSceneExecutor.ts
  - lib/document-editor/commands.ts
  - lib/document-editor/document-scene.ts
  - lib/document-editor/types.ts
  - components/document-editor/document-command-ui.ts
  - lib/scene-document/sceneRecordAdapter.ts
  - lib/scene-document/sceneSerializer.ts
  - lib/scene-document/sceneTypes.ts
  - lib/scene-document/sceneParser.ts
  - lib/scene-document/sceneValidation.ts
  - lib/editor/story-manuscript.ts
  - lib/story-doctor.ts
  - lib/translations.ts
  - lib/translations.json
  - lib/vn-plate-editor/embedded-commands.ts
  - lib/vn-plate-editor/embedded-renderers.ts
  - lib/vn-plate-editor/embedded-script.ts
  - lib/vn-plate-editor/scene-normalizer.ts
  - __tests__/unit/lib/story-doctor.test.ts
  - __tests__/unit/lib/useSceneExecutor-labels-goto.test.ts
finding_counts:
  critical: 0
  warning: 3
  info: 2
verification:
  typecheck: passed
  focused_tests: "29 passed across 4 files"
---

# In-scene branching review

## Verdict

The core cursor-based executor behavior is sound for the covered cases, including forward and backward jumps, conditional/else routing, disabled gotos, rollback replay, and the no-yield loop budget. The change is not ready to accept as fully complete because serialization/import is not a semantic round-trip, the editor can mutate valid operators, and Story Doctor normalizes identifiers differently from runtime.

Unrelated rollback, reader, and image-library changes in the same worktree were excluded except where the branching tests explicitly exercise rollback compatibility.

## Warnings

### W1 — Serialized label/goto commands cannot be parsed back into branching nodes

- Evidence: `lib/scene-document/sceneSerializer.ts:55-62` emits `[label ...]` and `[goto ...]` syntax.
- Evidence: `lib/scene-document/sceneParser.ts:120-142` recognizes only `background`, audio, and `choice`; every other bracket command becomes a generic `command` node.
- Evidence: `lib/scene-document/sceneValidation.ts:30-36` consequently reports these serialized commands as unknown rather than validating them as label/goto nodes.
- Impact: `parseSceneText(serializeScene(scene))` changes label/goto nodes into raw command nodes. Converting that parsed document back through `sceneRecordAdapter` cannot recreate executable branching. This contradicts the reported serialization/import-validation support and risks silent loss of control flow in text export/import workflows.
- Recommendation: teach `sceneParser.ts` to parse the emitted grammar (including typed condition values and every operator), validate label/goto fields, and add serializer-parser-adapter round-trip tests.

### W2 — Editing a goto can silently change supported condition operators

- Evidence: `lib/scene-document/sceneTypes.ts:127-130` and `lib/engine/types.ts:294-299` allow `contains`, `isEmpty`, `has`, and `not_has` in addition to comparison operators.
- Evidence: `lib/vn-plate-editor/embedded-script.ts:1817` limits the popover to `==`, `!=`, `>`, `<`, `>=`, and `<=`.
- Evidence: `lib/vn-plate-editor/embedded-script.ts:2037-2039` attempts to select the stored operator from that restricted list, while `lib/vn-plate-editor/embedded-script.ts:2093-2095` writes the select's current value back on save.
- Impact: opening and saving an imported/programmatically created goto using `contains`, `isEmpty`, `has`, or `not_has` replaces its operator with the select's first/default comparison operator, changing story behavior without warning.
- Recommendation: render all operators accepted by `Condition`, or preserve unknown/current operators and prevent lossy saves. Add an editor serialization test for each operator.

### W3 — Story Doctor can approve label names that runtime will not resolve

- Evidence: `lib/story-doctor.ts:382` trims label names and `lib/story-doctor.ts:421` trims goto targets before comparing them.
- Evidence: `lib/engine/useSceneExecutor.ts:39-46` compares the raw stored label name to the raw target with strict equality and no trimming.
- Impact: a label named `" checkpoint "` and a goto targeting `"checkpoint"` produce no dangling-target Doctor finding, but runtime falls through with “target label not found.” The embedded editor trims values, but imported/migrated/directly constructed canonical records can still contain whitespace.
- Recommendation: normalize identifiers at canonical-data boundaries and/or use the same normalization in executor and Doctor. Add a regression test covering whitespace and decide whether matching is case-sensitive.

## Info / test gaps

### I1 — No direct tests cover the new document/editor pipeline

The eight executor tests and two Doctor tests pass, but there are no new assertions for label/goto in parser/serializer round-trip, `sceneRecordAdapter` round-trip, embedded HTML render/collect, slash insertion, label rename/delete warning refresh, or condition value/operator preservation. The existing adapter test title says “all engine block types” but its fixture does not include label/goto (`__tests__/unit/lib/scene-document-adapter.test.ts:48-68`).

### I2 — Loop-budget behavior is intentionally destructive and production-silent

At `lib/engine/useSceneExecutor.ts:404-410`, exceeding 1000 auto-executed steps advances the cursor to scene completion; the warning is guarded by `__DEV__` at lines 406-408. This prevents hangs as claimed, but production readers receive no author-facing/runtime diagnostic and cannot distinguish a malformed loop from a legitimate ending. Consider surfacing a structured execution error while retaining the safety cap.

## Verified behavior

- Focused run passed: `useSceneExecutor-labels-goto`, `story-doctor`, `scene-document`, and `scene-document-adapter` — 4 files / 29 tests.
- `tsc --noEmit` passed.
- `git diff --check` passed.
- Executor routing uses the current runtime variables, applies generic step conditions before goto routing, jumps after the destination label, falls through on an absent false branch, ignores disabled gotos, and bounds yield-less loops.
- Story Doctor detects enabled empty/duplicate labels, empty goto targets, dangling primary/else targets, and counts goto conditions as variable reads.
