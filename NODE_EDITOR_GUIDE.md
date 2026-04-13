# Node-Based Visual Novel Editor - Implementation Guide

## Quick Start

### 1. Access the Editor

From the main editor screen, each story now has two editing options:

- **🗺 Graph** - Opens the professional node-based editor
- **✏️ Edit** - Opens the traditional scene-by-scene editor

### 2. Navigation Flow

```
Home Screen
  ↓
Editor Screen (story list)
  ↓
  ├─→ Node Editor (new) - Visual graph interface
  └─→ Scene Editor (old) - List-based interface
```

## Component Breakdown

### 1. StoryNode Component

**Purpose:** Visual representation of a single scene

**Features:**
- Compact card design (180x140px)
- Scene ID as title
- Text preview (60 chars)
- Media indicators (image, audio, voice)
- Choice count badge
- Warning system
- Connection handle

**Props:**
```typescript
interface Props {
  node: NodeData;
  isSelected: boolean;
  isHovered: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onConnectionStart: () => void;
}
```

**Visual States:**
- Default: Surface color, subtle shadow
- Selected: Primary color, elevated shadow
- Hovered: 2% scale increase
- Start node: Green border (2.5px)
- Has warnings: Orange border

### 2. NodeCanvas Component

**Purpose:** Interactive canvas with zoom, pan, and node management

**Features:**
- Infinite canvas with grid background
- Zoom controls (50% - 200%)
- Pan with drag gesture
- Connection mode with visual feedback
- Bezier curve edges
- Hierarchical auto-layout

**Props:**
```typescript
interface Props {
  story: Story;
  selectedSceneId: string | null;
  onNodeSelect: (nodeId: string) => void;
  onNodeConnect: (sourceId: string, targetId: string) => void;
  onNodeContextMenu: (nodeId: string) => void;
}
```

**Interactions:**
1. **Select Node:** Tap node
2. **Pan Canvas:** Drag background
3. **Zoom:** Use +/- buttons
4. **Connect Nodes:** 
   - Tap + handle on source
   - Tap target node
   - Connection created
5. **Context Menu:** Long press node

### 3. SceneEditorPanel Component

**Purpose:** Right-side panel for editing scene details

**Features:**
- Real-time change detection
- Auto-save indicator
- Media file pickers
- Choice management
- Scene navigation

**Props:**
```typescript
interface Props {
  story: Story;
  sceneId: string | null;
  onSave: (scene: StoryScene) => Promise<void>;
  onAddChoice: (sceneId: string, choice: Choice) => Promise<void>;
  onDeleteChoice: (sceneId: string, choiceId: string) => Promise<void>;
  onNavigateToScene: (sceneId: string) => void;
}
```

**Sections:**
1. Dialogue text editor
2. Background image picker
3. Voice audio picker
4. Background music picker
5. Choice list + add form

## Layout Algorithm

### Hierarchical BFS Layout

```typescript
function buildNodeLayout(story: Story): NodeData[] {
  // 1. BFS from start node
  const levels = new Map<string, number>();
  const queue = [story.startSceneId];
  levels.set(story.startSceneId, 0);
  
  while (queue.length > 0) {
    const id = queue.shift()!;
    const scene = story.scenes[id];
    
    for (const choice of scene.choices) {
      if (!levels.has(choice.nextSceneId)) {
        levels.set(choice.nextSceneId, levels.get(id)! + 1);
      }
      queue.push(choice.nextSceneId);
    }
  }
  
  // 2. Group by level
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels.entries()) {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(id);
  }
  
  // 3. Position nodes
  const nodes: NodeData[] = [];
  for (const [level, ids] of levelGroups.entries()) {
    ids.forEach((id, index) => {
      nodes.push({
        id,
        position: {
          x: 100 + index * (NODE_WIDTH + 60),
          y: 100 + level * (NODE_HEIGHT + 80),
        },
        // ... other properties
      });
    });
  }
  
  return nodes;
}
```

### Result

```
Level 0:  [START]
            ↓
Level 1:  [Scene A] [Scene B]
            ↓         ↓
Level 2:  [Scene C] [Scene D] [Scene E]
            ↓
Level 3:  [END]
```

## Edge Rendering

### Bezier Curves

```typescript
const x1 = sourceNode.position.x + NODE_WIDTH / 2;
const y1 = sourceNode.position.y + NODE_HEIGHT;
const x2 = targetNode.position.x + NODE_WIDTH / 2;
const y2 = targetNode.position.y;

const midY = (y1 + y2) / 2;
const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

<Path
  d={path}
  stroke={colors.primary}
  strokeWidth={2}
  fill="none"
  opacity={0.6}
  markerEnd="url(#arrowhead)"
/>
```

### Visual Style
- Smooth curves (not straight lines)
- Arrowhead markers
- Primary color with 60% opacity
- 2px stroke width

## Interaction Logic

### Connection Mode

```typescript
// State
const [selection, setSelection] = useState({
  isConnecting: false,
  connectionSource: null,
});

// Start connection
const handleConnectionStart = (nodeId: string) => {
  setSelection({
    isConnecting: true,
    connectionSource: nodeId,
  });
};

// Complete connection
const handleNodePress = (nodeId: string) => {
  if (selection.isConnecting && selection.connectionSource) {
    if (selection.connectionSource !== nodeId) {
      onNodeConnect(selection.connectionSource, nodeId);
    }
    setSelection({ isConnecting: false, connectionSource: null });
  } else {
    onNodeSelect(nodeId);
  }
};
```

### Pan & Zoom

```typescript
const panResponder = PanResponder.create({
  onPanResponderMove: (_, gesture) => {
    if (selection.isConnecting) {
      // Update connection line
      setConnectionEnd({
        x: gesture.moveX / viewport.zoom - viewport.x,
        y: gesture.moveY / viewport.zoom - viewport.y,
      });
    } else {
      // Pan canvas
      setViewport(prev => ({
        ...prev,
        x: prev.x + gesture.dx / viewport.zoom,
        y: prev.y + gesture.dy / viewport.zoom,
      }));
    }
  },
});
```

## Validation System

### Node Warnings

```typescript
const warnings: string[] = [];

if (!scene.text.trim()) {
  warnings.push('No dialogue text');
}

if (scene.choices.length === 0 && id !== story.startSceneId) {
  warnings.push('Dead end');
}

// Check for broken connections
for (const choice of scene.choices) {
  if (!story.scenes[choice.nextSceneId]) {
    warnings.push(`Broken link: ${choice.nextSceneId}`);
  }
}
```

### Visual Indicators

- ⚠️ icon on node header
- Orange border color
- Warning list in editor panel

## Performance Considerations

### Memoization

```typescript
// Compute layout only when story changes
const nodes = useMemo(() => buildNodeLayout(story), [story]);

// Build edges only when choices change
const edges = useMemo(() => buildEdges(story, nodes), [story, nodes]);

// Node map for O(1) lookups
const nodeMap = useMemo(() => {
  const m = new Map<string, NodeData>();
  for (const n of nodes) m.set(n.id, n);
  return m;
}, [nodes]);
```

### Event Optimization

- Debounced pan/zoom updates
- Throttled hover detection
- Batched SVG rendering

## Mobile Optimization

### Touch Targets

- Minimum 44x44px for all interactive elements
- Connection handle: 24x24px (acceptable for secondary action)
- Node: 180x140px (large enough for easy tapping)

### Gestures

- Single tap: Select
- Long press: Context menu
- Drag: Pan canvas
- Pinch: Zoom (future enhancement)

## Example Usage

### Creating a Branching Story

```typescript
// 1. Create story with start scene
const story: Story = {
  id: 'story-1',
  title: 'Adventure',
  startSceneId: 'scene_1',
  scenes: {
    scene_1: {
      id: 'scene_1',
      text: 'You wake up in a forest. What do you do?',
      choices: [
        { id: 'c1', text: 'Go left', nextSceneId: 'scene_2' },
        { id: 'c2', text: 'Go right', nextSceneId: 'scene_3' },
      ],
    },
    scene_2: {
      id: 'scene_2',
      text: 'You find a cave.',
      choices: [],
    },
    scene_3: {
      id: 'scene_3',
      text: 'You find a village.',
      choices: [],
    },
  },
};

// 2. Open node editor
router.push({
  pathname: '/node-editor',
  params: { storyId: story.id },
});

// 3. Visual result:
//
//     [START: scene_1]
//      /            \
//     /              \
// [scene_2]      [scene_3]
//  (cave)        (village)
```

## Troubleshooting

### Issue: Nodes overlap

**Solution:** Increase horizontal/vertical gap in layout algorithm

```typescript
const H_GAP = 60; // Increase this
const V_GAP = 80; // Or this
```

### Issue: Canvas too small

**Solution:** Calculate canvas size based on node positions

```typescript
const canvasWidth = Math.max(
  screenWidth * 2,
  ...nodes.map(n => n.position.x + NODE_WIDTH + 200)
);
```

### Issue: Connection line not visible

**Solution:** Check z-index and SVG rendering order

```typescript
// SVG must be rendered before nodes
<Svg>{/* edges */}</Svg>
{nodes.map(node => <StoryNode />)}
```

## Future Enhancements

### Phase 2: Advanced Features

1. **Minimap**
   - Small overview in corner
   - Shows entire graph
   - Click to navigate

2. **Search & Filter**
   - Search by scene ID or text
   - Filter by warnings
   - Highlight matching nodes

3. **Bulk Operations**
   - Multi-select nodes
   - Batch delete
   - Group operations

### Phase 3: Professional Tools

1. **Auto-Layout Algorithms**
   - Force-directed layout
   - Hierarchical layout
   - Circular layout

2. **Node Grouping**
   - Folders/categories
   - Collapse/expand groups
   - Color coding

3. **Export & Share**
   - Export as PNG/SVG
   - Share graph URL
   - Print layout

## Conclusion

This professional node-based editor provides a complete visual interface for creating complex branching narratives. The split-panel layout, interactive canvas, and real-time validation make it easy for both technical and non-technical users to build sophisticated visual novels.

**Key Benefits:**
- ✅ See entire story structure at a glance
- ✅ Visual branching paths
- ✅ Intuitive drag-and-connect
- ✅ Real-time validation
- ✅ Professional UX
- ✅ Mobile-optimized
