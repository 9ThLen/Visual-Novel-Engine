# VNE Editor Integration Plan
## Architecture Analysis & Implementation Blueprint

### Current State Analysis

**106 TypeScript files** across the project:

- **app/** (11): Routes — index, editor, scene-editor, reader, save-load, settings, oauth
- **components/** (31): UI components including lego-editor (old), editors/, ui/
- **lib/** (37): Core logic — types, stores, audio, characters, story, themes
- **stores/** (3): Zustand stores — use-app-store, use-lego-store, theme-store
- **hooks/** (16): Custom hooks for editor, scene data, responsive, etc.
- **constants/** (2): oauth, theme re-exports
- **config/** (5): vitest, expo, nativewind, global.d.ts

**Key Architectural Patterns:**
1. Zustand for global state (persist middleware → AsyncStorage/localStorage)
2. NativeWind (Tailwind CSS) for styling
3. Expo Router for navigation
4. React Native + web cross-platform
5. OKLCH color system with light/dark mode
6. Responsive layout (phone/tablet/desktop)

**Current Data Model:**
```
Story → StoryScene[] → { text, backgroundImageUri, characters, choices, musicUri, ... }
```

**Old Editor (being replaced):**
- Lego system: AtomBlock → MoleculeBlock → LegoScene
- 5 atom types: text_atom, character_atom, background_atom, audio_atom, fx_atom
- LegoFlowWorkspace + LegoCanvas + LegoBlockLibrary
- Stored in use-lego-store.ts

**New Design (from Stitch):**
- Event-based: UI Block → TimelineStep (Event[]) → Runtime
- 12+ block types with color-coded borders
- 3-panel layout: Block Library / Timeline / Properties
- Story Flow node graph
- Modals: Asset Picker, Character Creator, Save/Load
- Full Preview mode

### Integration Strategy

#### Phase 1: Core Engine (NEW files — no existing code modified)
- `lib/engine/types.ts` — All new types
- `lib/engine/event-factory.ts` — Event creation helpers
- `lib/engine/event-validator.ts` — Zod validation
- `lib/engine/timeline.ts` — Timeline state management
- `stores/use-editor-store.ts` — New editor-specific Zustand store
- `lib/engine/index.ts` — Re-exports

#### Phase 2: Scene Composer UI (NEW components)
- `components/editor/SceneComposer.tsx` — Main 3-panel layout
- `components/editor/BlockLibraryPanel.tsx` — Left panel
- `components/editor/TimelinePanel.tsx` — Center panel
- `components/editor/PropertiesPanel.tsx` — Right panel
- `components/editor/MiniPreview.tsx` — Bottom preview
- `components/editor/blocks/*.tsx` — Individual block type renders

#### Phase 3: Modals & Screens (NEW)
- `components/editor/modals/AssetPicker.tsx`
- `components/editor/modals/CharacterCreator.tsx`
- `components/editor/modals/SaveSceneDialog.tsx`
- `components/editor/modals/LoadSceneDialog.tsx`
- `components/editor/StoryFlowScreen.tsx`
- `components/editor/PreviewScreen.tsx`

#### Phase 4: Route Integration (MODIFY existing)
- Update `app/scene-editor.tsx` — Replace old editor with SceneComposer
- Add new routes: `/story-flow`, `/preview`
- Update `app/editor.tsx` — Add project metadata editing

#### Phase 5: Store Integration (MODIFY existing)
- Extend `stores/use-app-store.ts` — Add timelineSteps to StoryScene
- Keep backward compatibility with old blocks format
- Migration function: old blocks → new timeline events

#### Phase 6: Cleanup (DELETE old code)
- Delete `lib/atom-types.ts`
- Delete `lib/molecule-types.ts`
- Delete `lib/lego-types.ts`
- Delete `stores/use-lego-store.ts`
- Delete `components/lego-editor/` directory
- Delete `hooks/lego/` directory

### File-by-File Integration Map

#### Files to CREATE (new engine + UI):

```
lib/engine/
  types.ts              ← Core types (Project, Scene, TimelineStep, EngineEvent, etc.)
  event-factory.ts      ← createDialogueEvent(), createBackgroundEvent(), etc.
  event-validator.ts    ← Zod schemas for validation
  timeline.ts           ← TimelineState, stepForward, stepBackward, jumpTo
  event-dispatcher.ts   ← Maps events to runtime handlers
  state-restoration.ts  ← Snapshot/rollback system
  asset-database.ts     ← Asset management
  migration.ts          ← Legacy format → new event format
  index.ts              ← Re-exports

stores/
  use-editor-store.ts   ← Editor state: activeScene, timeline, selection, undo/redo

components/editor/
  SceneComposer.tsx     ← Main 3-panel editor layout
  BlockLibraryPanel.tsx ← Left panel with 12 block types
  TimelinePanel.tsx     ← Center vertical block chain
  PropertiesPanel.tsx   ← Right panel form fields
  MiniPreview.tsx       ← Bottom live preview
  EditorHeader.tsx      ← Scene name, undo/redo, preview, save
  blocks/
    BackgroundBlock.tsx
    CharacterBlock.tsx
    TextBlock.tsx
    DialogueBlock.tsx
    ChoiceBlock.tsx
    EffectBlock.tsx
    MusicBlock.tsx
    SoundBlock.tsx
    InteractiveObjectBlock.tsx
    CameraBlock.tsx
    VariableBlock.tsx
    TransitionBlock.tsx
  modals/
    AssetPicker.tsx
    CharacterCreator.tsx
    SaveSceneDialog.tsx
    LoadSceneDialog.tsx
    ConfirmDialog.tsx
  StoryFlowScreen.tsx   ← Node graph editor
  PreviewScreen.tsx     ← Full preview mode
```

#### Files to MODIFY:

```
app/scene-editor.tsx    ← Replace old editor with SceneComposer
app/editor.tsx          ← Add project metadata editing (title, description, tags, thumbnail)
lib/types.ts            ← Add timelineSteps field to StoryScene
lib/story-domain.ts     ← Add extractTimelineFromScene migration
stores/use-app-store.ts ← Add timeline-aware scene save/load
hooks/useResponsiveLayout.ts ← Add panel layout breakpoints
lib/_core/theme.ts      ← Verify editor tokens exist
```

#### Files to DELETE (after migration):

```
lib/atom-types.ts
lib/molecule-types.ts
lib/lego-types.ts
lib/lego-scene-export.ts
stores/use-lego-store.ts
components/lego-editor/AtomBlockComponent.tsx
components/lego-editor/LegoBlockLibrary.tsx
components/lego-editor/LegoCanvas.tsx
components/lego-editor/LegoFlowWorkspace.tsx
hooks/lego/index.ts
hooks/lego/useLegoDnD.ts
hooks/lego/useLegoTabs.ts
hooks/lego/useSceneManagement.ts
components/editors/SceneEditorHeader.tsx  (replaced by EditorHeader)
components/editors/ViewModeTabs.tsx      (replaced by new layout)
components/editors/StorySceneEditor/SceneEditorForm.tsx (replaced by PropertiesPanel)
```

### Color Mapping (Stitch → Existing OKLCH)

Stitch generated colors map to existing theme tokens:

| Block Type | Stitch Color | Existing Token | Value (dark) |
|-----------|-------------|----------------|-------------|
| Background | #50c878 | lego-background | oklch(65% 0.12 155) |
| Character | #f5a623 | lego-character | oklch(72% 0.13 80) |
| Text/Narration | #7c5bf5 | lego-dialogue | oklch(62% 0.18 280) |
| Dialogue | #9b59b6 | lego-dialogue | oklch(62% 0.18 280) |
| Choice | #e91e63 | lego-choice | oklch(65% 0.14 250) |
| Effect | #ffd93d | lego-fx | oklch(78% 0.12 95) |
| Music | #ff6b6b | lego-audio | oklch(62% 0.15 25) |
| Sound | #ef5350 | lego-audio | oklch(62% 0.15 25) |
| Interactive Object | #00bcd4 | lego-variable | oklch(72% 0.10 210) |
| Camera | #009688 | (new) | oklch(65% 0.12 175) |
| Variable | #8bc34a | lego-variable | oklch(72% 0.10 130) |
| Transition | #3f51b5 | lego-transition | oklch(60% 0.16 310) |

### Responsive Layout Strategy

Based on existing `useResponsiveLayout()`:

**Phone (< 768px):**
- Single panel at a time
- Block Library → bottom sheet modal
- Properties → slide-in from right
- Timeline → full screen
- Tab bar to switch between views

**Tablet (768px - 1024px):**
- 2-panel: Block Library (280px) + Timeline (flex)
- Properties → modal overlay
- Mini preview → collapsible bottom bar

**Desktop (> 1024px):**
- Full 3-panel: Block Library (280px) + Timeline (flex) + Properties (300px)
- Mini preview → fixed bottom 120px
- All panels visible simultaneously

### Key Technical Decisions

1. **No overlapping elements**: Each panel uses `flex: 1` with fixed-width side panels. z-index only for modals/overlays.

2. **Drag and Drop**: Use `react-native-gesture-handler` + `react-native-reanimated` (already in project). On web, use HTML5 drag API with polyfill.

3. **State Management**: New `use-editor-store.ts` for editor-specific state (selection, timeline, undo/redo). Keep `use-app-store.ts` for persisted story data.

4. **Backward Compatibility**: Add `timelineSteps?` field to existing `StoryScene` type. Migration function converts old `blocks?` to new `timelineSteps`. Old reader code still works with `text`, `choices`, `backgroundImageUri`.

5. **Component Architecture**: Each block type is an island component. PropertiesPanel switches render based on selected block type. Timeline is a FlatList of block components.

6. **Import/Export**: Keep existing JSON format as legacy. Add new format with timeline. Export both formats.

### Risk Mitigation

1. **Stitch HTML → React Native**: Stitch generates web HTML/Tailwind. We extract layout structure, colors, spacing → map to React Native View/Text/Pressable with NativeWind classes.

2. **Performance**: Timeline with 100+ blocks → use FlatList with `getItemLayout` for constant-height blocks. Virtualize if needed.

3. **Cross-platform**: Test drag-and-drop on web (HTML5) vs native (gesture-handler). Use platform-specific implementations where needed.

4. **Data loss risk**: Keep old lego code intact until new editor is fully tested. Feature flag to switch between editors.
