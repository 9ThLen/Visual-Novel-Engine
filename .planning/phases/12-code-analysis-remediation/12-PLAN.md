# Phase 12 — Code Analysis Remediation

## Objective

Fix the findings from `wiki/code-analysis-report-2026-06-01.md` and `wiki/optimization-plan-2026-06-01.md`, prioritizing the hardest and highest-risk problems first.

## Execution Order

1. DocumentSceneEditor runtime UX and architecture
   - Stop scroll-to-bottom on ordinary focus, typing, and content-size updates.
   - Keep intentional follow only for append/new-line flows.
   - Remove forced page min-height where it creates artificial scroll jumps.
   - Add regression checks for focus, typing, keyboard, and long documents.
   - Then decompose into toolbar, page, block, command palette, settings, and editor hooks.

2. Unsupported block UX
   - Mark `sound`, `camera`, and `interactive_object` as coming soon in shared block metadata.
   - Disable adding them from `BlockLibraryPanel`, including tooltip add.
   - Remove production executor warnings for known no-op block types.

3. SceneComposer theme hardening
   - Replace desktop hardcoded hex/rgba colors with `useColors()` tokens.
   - Verify dark theme for desktop editor, sidebars, document sheet, and footer.

4. Import and bundled demo validation
   - Validate canonical `TimelineStep` block type, block data shape, and URI fields during import.
   - Replace demo story `as unknown as Story` casts with validated import/fallback.

5. Reader runtime decomposition
   - Extract display, dialogue, controls, choices, and transition UI.
   - Keep `StoryReaderResponsive` as orchestration only.
   - Fix executor/typewriter state sync.

6. Store and story state cleanup
   - Fix `reorderScenes` with explicit ordering instead of relying on `Record`.
   - Optimize `useStoryState()` allocations.
   - Plan store split only after persistence migration tests are in place.

7. Medium/low cleanup
   - Guard production logs.
   - Remove `router.push(... as never)` anti-patterns.
   - Improve CSP/SRI docs or implementation where still missing.
   - Add URI cache TTL and SVG data URI handling.

## Verification

- `corepack pnpm run check`
- Targeted unit tests for touched engine/import/store utilities
- Manual web/native checks for DocumentSceneEditor focus and unsupported block UI
- Dark theme pass on SceneComposer desktop

## Current First Slice

Start with DocumentSceneEditor scroll behavior and unsupported no-op block UX because they are the highest user-impact issues and touch files already modified in the working tree.
