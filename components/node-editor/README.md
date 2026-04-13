# Professional Node-Based Story Editor

## Overview

A complete redesign of the visual novel editor interface with a professional node-based graph system for creating and managing branching narratives.

## Architecture

### Component Structure

```
components/node-editor/
├── types.ts              # TypeScript interfaces
├── StoryNode.tsx         # Individual node component
├── NodeCanvas.tsx        # Main canvas with zoom/pan
├── SceneEditorPanel.tsx  # Right-side editing panel
└── index.ts              # Exports
```

### Layout

```
┌─────────────────────────────────────────────────────────┐
│                    Top Navigation Bar                    │
├──────────────────────────────┬──────────────────────────┤
│                              │                          │
│      Node Canvas (Left)      │  Scene Editor (Right)    │
│                              │                          │
│  • Visual graph              │  • Dialogue text         │
│  • Zoom/pan controls         │  • Media uploads         │
│  • Drag connections          │  • Choice management     │
│  • Node selection            │  • Save button           │
│                              │                          │
└──────────────────────────────┴──────────────────────────┘
```

## Features

### 1. Visual Node Graph

**Node Display:**
- Scene ID as title
- Text preview (first 60 chars)
- Visual indicators:
  - 🖼 Background image
  - 🎵 Background music
  - 🗣 Voice audio
- Choice count badge
- Warning indicators (⚠️)
- START badge for entry point
- END badge for terminal nodes

**Node States:**
- Default: Gray background
- Selected: Primary color highlight
- Hovered: Slight scale animation
- Start node: Green border
- Has warnings: Orange border

**Interactions:**
- Tap: Select node
- Long press: Context menu (Edit/Delete)
- Connection handle (+): Start connection mode

### 2. Canvas Controls

**Zoom:**
- Zoom in (+) button
- Zoom out (−) button
- Reset view (⟲) button
- Range: 50% - 200%
- Display: Current zoom percentage

**Pan:**
- Drag canvas to move viewport
- Smooth scrolling
- Grid background for reference

**Connection Mode:**
- Tap connection handle on source node
- Drag to target node or tap target
- Visual feedback with dashed line
- Cancel by dragging off canvas

### 3. Scene Editor Panel

**Sections:**

1. **Dialogue Text**
   - Multi-line text input
   - Hint: "Name: text" format for speakers
   - Auto-save indicator

2. **Background Image**
   - Image preview
   - Pick from device
   - Clear button

3. **Voice Audio**
   - File name display
   - Pick audio file
   - Clear button

4. **Background Music**
   - File name display
   - Pick audio file
   - Clear button

5. **Choices**
   - List of existing choices
   - Each shows: text + target scene
   - Delete button per choice
   - Add new choice form:
     - Choice text input
     - Target scene selector (scrollable list)
     - Add button

**Save System:**
- Save button in header
- Enabled only when changes detected
- Visual feedback (green when active)
- Success/error alerts

### 4. Layout Algorithm

**Hierarchical BFS Layout:**
1. Start from `startSceneId`
2. Assign level to each reachable scene
3. Group scenes by level
4. Position horizontally within level
5. Unreachable scenes go to bottom

**Spacing:**
- Node width: 180px
- Node height: 140px
- Horizontal gap: 60px
- Vertical gap: 80px
- Padding: 100px

### 5. Edge Rendering

**Visual Style:**
- Bezier curves for smooth connections
- Primary color with 60% opacity
- 2px stroke width
- Arrowhead markers
- Label: Choice text (optional)

**Connection Logic:**
- Source: Bottom center of node
- Target: Top center of node
- Curve control points at midpoint

### 6. Validation & Warnings

**Node Warnings:**
- No dialogue text
- Dead end (no choices, not start)
- Broken connections (target doesn't exist)

**Visual Indicators:**
- ⚠️ icon on node
- Orange border
- Warning list in editor panel

## Usage

### Basic Workflow

1. **View Story Structure**
   - Open node editor
   - See all scenes as nodes
   - Identify branches and paths

2. **Edit Scene**
   - Click node to select
   - Edit in right panel
   - Save changes

3. **Create Connection**
   - Click + handle on source node
   - Tap target node
   - New choice created automatically

4. **Add New Scene**
   - Use "Add Scene" button (to be added)
   - Or create from editor panel

5. **Delete Scene**
   - Long press node
   - Select "Delete" from menu
   - Confirm action

### Keyboard Shortcuts (Future)

- `Space + Drag`: Pan canvas
- `Ctrl + Scroll`: Zoom
- `Delete`: Delete selected node
- `Ctrl + S`: Save current scene
- `Ctrl + Z`: Undo
- `Ctrl + Y`: Redo

## Technical Details

### State Management

**Canvas State:**
```typescript
{
  viewport: { x, y, zoom },
  selection: {
    selectedNodeId,
    hoveredNodeId,
    isDragging,
    isConnecting,
    connectionSource
  }
}
```

**Node Data:**
```typescript
{
  id: string,
  position: { x, y },
  size: { width, height },
  isStart: boolean,
  isEnd: boolean,
  hasImage: boolean,
  hasAudio: boolean,
  hasVoice: boolean,
  choiceCount: number,
  textPreview: string,
  warnings: string[]
}
```

### Performance Optimizations

1. **Memoization:**
   - Node layout calculated once per story change
   - Edge list rebuilt only when choices change
   - Node map for O(1) lookups

2. **Lazy Rendering:**
   - Only visible nodes rendered (future)
   - SVG edges batched
   - Image loading deferred

3. **Event Handling:**
   - Debounced pan/zoom
   - Throttled hover detection
   - Optimized touch responders

### Accessibility

- High contrast mode support
- Keyboard navigation (future)
- Screen reader labels
- Focus indicators
- Touch target sizes (44x44 minimum)

## Integration

### Adding to Navigation

```typescript
// In app/_layout.tsx
<Stack.Screen name="node-editor" />

// Navigate from editor
router.push({
  pathname: '/node-editor',
  params: { storyId: story.id }
});
```

### Data Flow

```
Story (AsyncStorage)
  ↓
StoryContext
  ↓
NodeEditor
  ↓
├─ NodeCanvas (read-only visualization)
└─ SceneEditorPanel (edit operations)
  ↓
storyContextEnhanced (CRUD)
  ↓
AsyncStorage (persist)
```

## Future Enhancements

### Phase 2
- [ ] Minimap for large graphs
- [ ] Search/filter nodes
- [ ] Bulk operations
- [ ] Copy/paste nodes
- [ ] Undo/redo system

### Phase 3
- [ ] Auto-layout algorithms (force-directed, hierarchical)
- [ ] Node grouping/folders
- [ ] Comments and annotations
- [ ] Export as image
- [ ] Collaborative editing

### Phase 4
- [ ] Variables and conditions
- [ ] Script execution
- [ ] Timeline view
- [ ] Analytics (path frequency)
- [ ] A/B testing support

## Design Principles

1. **Clarity Over Complexity**
   - Clean, minimal interface
   - Clear visual hierarchy
   - Consistent spacing

2. **Professional Tools**
   - Inspired by Unreal Blueprints, Unity Shader Graph
   - Industry-standard interactions
   - Power user features

3. **Non-Technical Users**
   - No coding required
   - Visual feedback
   - Helpful hints and warnings

4. **Mobile-First**
   - Touch-optimized
   - Responsive layout
   - Gesture support

## Comparison: Old vs New

### Old Editor (scene-editor.tsx)
- ❌ List-based view
- ❌ No visual structure
- ❌ Hard to see branches
- ❌ Tab switching required
- ✅ Simple for small stories

### New Editor (node-editor.tsx)
- ✅ Visual graph
- ✅ See entire structure
- ✅ Clear branching paths
- ✅ Split-panel layout
- ✅ Professional UX
- ✅ Scales to large stories

## Conclusion

This professional node-based editor transforms the visual novel creation experience from a text-heavy list interface to an intuitive, visual graph system. Users can now see and understand the complete story structure at a glance, making it easier to create complex branching narratives.
