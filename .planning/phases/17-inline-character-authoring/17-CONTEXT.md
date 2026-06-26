# Phase 17 - Inline Character Authoring Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Source:** User design discussion + external model recommendations

<domain>
## Phase Boundary

Replace the current non-actionable visible character block UX with compact inline character tokens in the Plate scene authoring flow.

The author writes `Маша:`. The editor turns it into a compact colored token inside the dialogue line. Controls are hidden unless the token is clicked. A new character opens controls once on first creation; existing characters reuse stored authoring defaults without interrupting writing.

This phase depends on Phase 16 Plate editor migration being active or stable enough for inline editor work.
</domain>

<decisions>
## Implementation Decisions

### D-01 Inline Token
- Character authoring is represented as an inline token such as `Маша:` inside the dialogue line, not as a large visible technical block.
- The token occupies roughly the same inline space as normal text and uses a bright rectangular background.
- Controls open only when the token is clicked.

### D-02 First-Use Menu
- When a new character name is typed for the first time, create the character and open the character menu automatically once.
- Existing characters must not open the menu automatically on each later dialogue line.

### D-03 Stable Character Identity
- Character lookup is case-insensitive by name.
- Each character gets a persistent color on creation.
- The color is stored in `characterLibraries[storyId]`, not recalculated from mutable display text.

### D-04 User-Owned Sprites
- Sprites are not preset options.
- Users upload sprites, name them themselves, rename them, and delete them.
- Sprites added for a character remain attached to that character and are available in later scenes.

### D-05 Sprite ID Semantics
- `spriteId` is a sprite ID from `Character.sprites`, not an image URI.
- A resolver must map `storyId + characterId + spriteId` to `CharacterSprite.uri`.
- Import validation must stop treating character `spriteId` as a safe asset reference URI.

### D-06 Authoring Defaults vs Runtime State
- Character library stores authoring defaults: current/default sprite and position for future writing.
- Runtime scene state stores what is currently visible during execution.
- Do not treat `characterLibraries[storyId].authoring.currentSpriteId` as reader runtime truth.

### D-07 Character Actions
- Internal character timeline steps support `show`, `hide`, `change_sprite`, and `move`.
- Do not add `speak` as a character action.
- Speaker focus belongs to `DialogueBlockData`.

### D-08 Save Pipeline
- Build generated character steps per scene by scanning authoring blocks top to bottom.
- Insert `show` only when the character is not already visible in that scene.
- Insert `change_sprite` only when the effective sprite changes.
- Dialogue entries carry speaker focus data.

### D-09 Speaker Focus
- Repeated dialogue by an already visible character must not replay entrance animation.
- The speaking character may scale slightly toward the reader and dim others.
- Focus should be configurable per character with sane defaults.

### D-10 Active Editor Boundary
- Active editor screens must not import `components/editor-legacy` or `stores/use-editor-store`.
- Use `useAppStore()` directly for character library updates.

### D-11 Migration And Compatibility
- Existing characters without `color` or `authoring` metadata must be migrated lazily on load/save.
- Existing dialogue steps without `speakerFocus` remain valid and render without focus.
- Existing character steps without `action` are treated as `show`.

### D-12 Bridge Protocol
- Inline token clicks must cross the WebView/Plate bridge through explicit messages, not implicit DOM state.
- Token DOM must carry stable `data-character-id`; display name can change without changing identity.
- Renaming a character updates all tokens for the same `characterId`.

### D-13 Missing Data Behavior
- Characters with no sprites are valid; authoring shows upload controls and runtime degrades gracefully.
- Missing sprite IDs fall back to `authoring.currentSpriteId`, then `defaultSpriteId`, then no sprite.
- Deleted/missing characters must not crash scenes; tokens degrade to speaker text and surface a warning.

### D-14 Single-Tab Assumption
- This phase assumes single-tab editing. Multi-tab conflict resolution and real-time synchronization are deferred.

### D-15 First-Use Menu State
- First-use menu opening is a transient editor event, not persisted character state.
- Creating a character during the current editor session emits one `openCharacterPopover` command.
- Reopening the story/editor later must not auto-open old character menus.

### D-16 Undo And Library Mutations
- Character library mutations triggered from inline controls must either integrate with the editor undo path or be handled as explicit out-of-band save actions.
- Text undo must not silently desynchronize token metadata from `characterLibraries`.

### D-17 Asset Lifecycle
- Removing a sprite from a character removes the sprite record from that character.
- Phase 17 must not physically delete the underlying file/asset unless an existing media-library deletion path guarantees safe reference checks.
- Dialogue tokens that reference a deleted sprite fall back safely and surface a warning.

### D-18 Export Import Contract
- Exported stories include character colors, user-named sprites, and authoring metadata required for future editing.
- Imported old stories are migrated lazily.
- Runtime save/load must not depend on editor-only authoring metadata.

### D-19 Accessibility
- Inline speaker tokens are keyboard and screen-reader reachable.
- Tokens expose an edit-character label and open controls with Enter/Space/click/tap.
- Screen readers must still read the dialogue line coherently.

### D-20 Name Parsing And Normalization
- Speaker names are normalized with trim, collapsed whitespace, and Unicode NFC before lookup.
- Parser must avoid false positives for URLs and narration lines with internal colons.
- Token display reads the current character name from the library so rename updates all tokens sharing the same `characterId`.

### D-21 Scene Branching
- Generated scene timelines do not inherit visible character runtime state across scenes or branches.
- Each scene starts from clean runtime character visibility unless explicit scene data later defines a different contract.

### D-22 Mobile Controls
- Desktop may use a popover.
- Phone/native must have a bottom-sheet or full-width panel fallback when the popover cannot fit.

### D-23 Upload Validation And Performance
- Sprite upload validates image type, size, URI safety, and duplicate sprite names.
- Sprite lists should avoid decoding every full-size image in the inline token path; use lazy preview/thumbnails where available.

### D-24 Speaker Display Names
- Runtime dialogue must show the character display name, not internal `characterId`.
- Either `DialogueEntry` stores a `speakerName` snapshot or reader display resolves `characterId` through `characterLibraries[storyId]`.
- `getTimelineDisplayPages` and `StoryReaderResponsive.extractSpeaker` must not expose IDs like `char_abc123` to users.

### D-25 Reader Library Access
- Reader and Preview character sprite/name resolution require `characterLibraries[storyId]`.
- `StoryReaderResponsive` or `useReaderAssets` must pull/pass the library explicitly instead of sending raw `spriteId` to `resolveAssetUri`.

### D-26 Interactive Object Speakers
- Interactive object dialogue speakers should use the same character display-name pipeline when they reference a character ID.
- Full interactive-object speaker focus behavior can be deferred if it is larger than this phase, but it must not regress existing object dialogue.

### D-27 Story Schema Version
- Character-library migration needs a schema marker or equivalent migration version.
- Imported/exported stories should make it possible to tell whether character authoring metadata has been migrated.

### D-28 Explicit Step Priority
- Manually authored technical character steps take priority at their position in the scene.
- Generated inline character steps must not erase or reorder explicit technical character steps.
- If explicit and generated state conflict, the later step in timeline order wins.

### D-29 Character Deletion Policy
- Destructive character deletion is blocked or strongly warned when references exist.
- Default behavior should be non-destructive: show reference count and offer rename/disable instead of immediate delete.
- If deletion proceeds, existing dialogue degrades safely as defined in D-13.

### D-30 Sprite Name Scope
- Sprite display names only need to be unique within a single character.
- Duplicate sprite names for the same character require explicit rename or safe auto-suffix.
- Different characters may have sprites with the same display name.

### D-31 I18n
- New visible labels, warnings, errors, and accessibility labels must use `lib/translations.ts`.
- No hardcoded user-facing English/Ukrainian strings in reusable editor components.

### D-32 Sprite Image Limits
- Upload validation checks both file size and image dimensions.
- Oversized image dimensions must be rejected or downscaled through an existing safe image path.

### D-33 Dialogue Sprite Snapshot Semantics
- Each existing dialogue line stores or resolves a concrete `spriteId` snapshot.
- `character.authoring.currentSpriteId` affects future new dialogue lines and explicit manual changes only.
- Changing current sprite must not unexpectedly rewrite older dialogue lines unless the user chooses a bulk apply action.

### D-34 Upload Save Failure
- If sprite upload/library mutation succeeds but scene save fails, the UI must show retry/recovery state.
- Sprite records should not silently disappear or leave tokens pointing at unsaved state without a warning.

### D-35 Dialogue Identity Contract
- `DialogueEntry.characterId` stores the stable library ID.
- Display name is separate: either `DialogueEntry.speakerName` snapshot or render-time `characterId -> Character.name` resolution.
- `DocumentDialogueBlock.characterId` and `sourceStep` must preserve the ID through `SceneRecord -> DocumentScene -> save -> TimelineStep`.

### D-36 WebView Token Identity
- `transformDialogueIfNeeded` must resolve typed speaker names against the WebView payload character list.
- Existing characters get `data-character-id` immediately.
- New names trigger the bridge creation flow; after creation, the DOM token is patched with the new `characterId`.
- `blockToHtml` must render `speaker-token` with `data-character-id`, token color, and escaped display text.

### D-37 Animation Cache
- Character animation values must be cached per character and not recreated on every render.
- Phase 17 should fix any existing `new Animated.Value()` render-loop/leak in the character animation pipeline it touches.

### D-38 Missing Sprite Rendering
- Runtime should still render a character layer entry when a character is visible but sprite URI is missing.
- Reader/Preview show a placeholder and editor warning instead of hiding the character layer entirely.
</decisions>

<canonical_refs>
## Canonical References

### Engine and Runtime
- `lib/engine/types.ts` - `CharacterBlockData`, `DialogueBlockData`, `TimelineStep`
- `lib/engine/event-factory.ts` - default character/dialogue step creation
- `lib/engine/useSceneExecutor.ts` - runtime execution of character and dialogue steps
- `lib/engine/runtime-types.ts` - scene runtime state

### Character Library
- `lib/character-types.ts` - character and sprite persistence model
- `stores/use-app-store.ts` - `characterLibraries[storyId]` storage and updates

### Plate/Document Authoring
- `lib/document-editor/types.ts` - document scene authoring blocks
- `lib/document-editor/document-scene.ts` - document scene conversion and character creation helpers
- `lib/vn-plate-editor/scene-normalizer.ts` - Plate bridge normalization
- `lib/vn-plate-editor/embedded-script.ts` - WebView editor behavior
- `components/editor/plate/character-colors.ts` - existing deterministic color helper

### Reader and Preview
- `components/story-reader-responsive.tsx` - reader orchestration, speaker extraction, and `useReaderAssets` call site
- `hooks/useReaderAssets.ts` - reader character asset resolution path
- `hooks/useCharacterAnimations.ts` - character instance construction and position propagation
- `hooks/useSceneImages.ts` - image URI resolution
- `components/reader/ReaderDisplay.tsx` - character rendering and speaker focus target
- `components/CharacterDisplay.tsx` - sprite display, focus props, and accessibility target
- `components/editor/PreviewScreen.tsx` - preview character rendering placeholder to replace

### Validation and Tests
- `lib/story-hooks.ts` - canonical import validation
- `__tests__/unit/editor/plate-scene-roundtrip.test.ts` - serializer roundtrip coverage
- `__tests__/unit/lib/document-editor.test.ts` - document parser/character tests
</canonical_refs>

<deferred>
## Deferred Ideas

- Character aliases and merge workflow.
- Bulk "apply from here onward" for already existing old dialogue lines.
- Complex per-character animation curves.
- Delay/duration behavior for character actions.
- Full global asset manager redesign outside the inline token popover.
- Multi-tab concurrent editing conflict resolution.
- Physical asset garbage collection for deleted sprites.
- Cross-scene runtime state carry-over.
- Bulk apply current sprite to already existing dialogue lines.
</deferred>
