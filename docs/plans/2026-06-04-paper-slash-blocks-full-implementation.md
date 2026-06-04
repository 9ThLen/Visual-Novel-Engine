# Paper Slash Blocks Full Implementation

Date: 2026-06-04

## Scope

Make every block inserted through the paper editor slash menu (`/`) fully usable, not only insertable.

## Gaps

- `sound`: runtime play exists, but loop stop uses a different audio channel key; UI misses `loop` and `pitchVariation`.
- `effect`: runtime exists, but UI misses `duration` and character target; blur has no visible rendering.
- `camera`: runtime exists, but UI misses `panX`, `panY`, `target`, and `easing`, so pan/focus cannot be configured from paper editor.
- `interactive_object`: runtime exists, but UI misses size, one-time/pulse flags, and action editing.
- `BLOCK_TYPE_INFO`: `sound`, `camera`, `interactive_object` still marked `comingSoon/disabled`.

## Implementation Plan

1. Update metadata so slash/Lego block status matches implemented runtime.
2. Fix SFX channel identity so `sound` stop can stop looped sounds reliably.
3. Expand `DocumentTechnicalPropertiesPanel` fields:
   - `sound`: action, volume, loop, pitch variation.
   - `effect`: type, target, character id, intensity, duration.
   - `camera`: action, zoom, pan, target, duration, easing.
   - `interactive_object`: name, sprite, x/y/width/height, one-time, pulse, first action editor.
4. Add regression tests for command status and sound loop channel behavior.
5. Verify with targeted tests and typecheck.
