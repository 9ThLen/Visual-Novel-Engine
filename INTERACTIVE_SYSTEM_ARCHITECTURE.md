# Interactive Objects & Inventory System Architecture

## Overview

Complete system for adding clickable interactive objects to visual novel scenes with integrated inventory management.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Data Layer                           │
│  - interactive-types.ts (Type definitions)              │
│  - inventory-context.tsx (State management)             │
│  - AsyncStorage (Persistence)                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Component Layer                        │
│  - InteractiveObjectsLayer (Rendering & interaction)   │
│  - InventoryUI (Display inventory)                      │
│  - ItemNotification (Toast notifications)               │
│  - InteractiveObjectsEditor (Scene editor integration) │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Integration                           │
│  - reader.tsx (Game runtime)                            │
│  - scene-editor.tsx (Authoring tool)                    │
│  - _layout.tsx (Provider setup)                         │
└─────────────────────────────────────────────────────────┘
```

## Data Structures

### 1. Interactive Object

```typescript
interface InteractiveObject {
  id: string;
  name: string;
  position: {
    x: number;      // Percentage (0-100)
    y: number;      // Percentage (0-100)
    width: number;  // Percentage (0-100)
    height: number; // Percentage (0-100)
  };
  
  // Visual
  imageUri?: string;
  highlightOnHover?: boolean;
  pulseAnimation?: boolean;
  glowColor?: string;
  
  // Behavior
  actions: InteractiveAction[];
  requiredItems?: string[];
  oneTimeOnly?: boolean;
  isActive?: boolean;
}
```

### 2. Actions

**Available Action Types:**
- `dialogue` - Show dialogue text
- `scene_transition` - Navigate to another scene
- `play_audio` - Play sound effect
- `add_item` - Add item to inventory
- `remove_item` - Remove item from inventory
- `show_image` - Display image overlay
- `trigger_event` - Custom event trigger

**Example Actions:**

```typescript
// Dialogue
{
  type: 'dialogue',
  text: 'You found a key!',
  speaker: 'Narrator'
}

// Scene Transition
{
  type: 'scene_transition',
  targetSceneId: 'room_2',
  transition: 'fade'
}

// Add Item
{
  type: 'add_item',
  item: {
    id: 'key_001',
    name: 'Rusty Key',
    description: 'An old key covered in rust',
    iconUri: 'file://key.png',
    category: 'key'
  },
  showNotification: true
}

// Play Audio
{
  type: 'play_audio',
  audioUri: 'file://door_open.mp3',
  volume: 0.7,
  loop: false
}
```

### 3. Inventory Item

```typescript
interface InventoryItem {
  id: string;
  name: string;
  description: string;
  iconUri: string;
  category?: string;
  metadata?: Record<string, any>;
}
```

### 4. Inventory State

```typescript
interface InventoryState {
  items: InventoryItem[];
  maxSlots?: number; // Default: 50
}
```

## Component Details

### InteractiveObjectsLayer

**Purpose:** Renders clickable objects on top of scene background

**Features:**
- Position-based rendering (percentage coordinates)
- Touch/click detection
- Visual feedback (pulse, glow animations)
- Action execution
- Conditional interaction (required items)
- One-time interaction support

**Props:**
```typescript
{
  objects: InteractiveObject[];
  onSceneTransition?: (sceneId: string) => void;
  onDialogue?: (text: string, speaker?: string) => void;
  onPlayAudio?: (audioUri: string, volume?: number) => void;
  onShowImage?: (imageUri: string, duration?: number) => void;
  onEvent?: (eventId: string, data?: any) => void;
}
```

**Usage:**
```tsx
<InteractiveObjectsLayer
  objects={scene.interactiveObjects || []}
  onSceneTransition={handleSceneChange}
  onDialogue={showDialogue}
  onPlayAudio={playSound}
/>
```

### InventoryUI

**Purpose:** Modal display of player inventory

**Features:**
- Grid layout with item cards
- Item selection and details
- Category badges
- Empty state
- Scrollable

**Props:**
```typescript
{
  visible: boolean;
  onClose: () => void;
}
```

**Usage:**
```tsx
const [showInventory, setShowInventory] = useState(false);

<InventoryUI
  visible={showInventory}
  onClose={() => setShowInventory(false)}
/>
```

### ItemNotification

**Purpose:** Toast notification when item is acquired

**Features:**
- Slide-in animation
- Auto-hide after 3 seconds
- Item icon and name
- Checkmark indicator

**Usage:**
```tsx
<ItemNotification
  item={acquiredItem}
  visible={showNotification}
  onHide={() => setShowNotification(false)}
/>
```

### InteractiveObjectsEditor

**Purpose:** Scene editor component for configuring objects

**Features:**
- Preset templates
- Object list management
- Position editor (x, y, width, height)
- Action configuration
- Visual feedback settings

**Usage:**
```tsx
<InteractiveObjectsEditor
  objects={interactiveObjects}
  onChange={setInteractiveObjects}
/>
```

## Inventory Context API

### Provider Setup

```tsx
import { InventoryProvider } from '@/lib/inventory-context';

<InventoryProvider>
  <App />
</InventoryProvider>
```

### Hook Usage

```typescript
import { useInventory } from '@/lib/inventory-context';

function MyComponent() {
  const {
    inventory,        // Current inventory state
    addItem,          // Add item (returns boolean)
    removeItem,       // Remove item (returns boolean)
    hasItem,          // Check if item exists
    hasItems,         // Check multiple items
    clearInventory,   // Clear all items
    getItem,          // Get item by ID
  } = useInventory();
  
  // Add item
  const success = await addItem({
    id: 'key_001',
    name: 'Key',
    description: 'A rusty key',
    iconUri: 'file://key.png'
  });
  
  // Check item
  if (hasItem('key_001')) {
    console.log('Player has the key!');
  }
  
  // Check multiple items
  if (hasItems(['key_001', 'map_001'])) {
    console.log('Player has both items!');
  }
}
```

## Preset Templates

### 1. Door
- Scene transition on click
- Positioned for typical door location
- Fade transition

### 2. Item Pickup
- Adds item to inventory
- Shows notification
- One-time only
- Pulse animation with gold glow

### 3. Dialogue Trigger
- Shows dialogue on click
- Can be clicked multiple times

### 4. Audio Trigger
- Plays sound effect
- Configurable volume and loop

### 5. Locked Door
- Requires specific item(s)
- Shows message if locked
- Transitions if unlocked

## Position System

Objects use **percentage-based positioning** for responsive design:

```typescript
position: {
  x: 40,      // 40% from left
  y: 30,      // 30% from top
  width: 20,  // 20% of screen width
  height: 40  // 40% of screen height
}
```

**Benefits:**
- Works on all screen sizes
- Maintains relative positioning
- Easy to configure

**Coordinate System:**
```
(0,0) ────────────────── (100,0)
  │                         │
  │                         │
  │      Interactive        │
  │        Object           │
  │                         │
  │                         │
(0,100) ──────────────── (100,100)
```

## Interaction Flow

```
User taps object
       ↓
Check if active
       ↓
Check one-time status
       ↓
Check required items
       ↓
Execute actions sequentially:
  1. Dialogue
  2. Add/Remove items
  3. Play audio
  4. Scene transition
  5. Custom events
       ↓
Mark as clicked (if one-time)
       ↓
Show notifications
```

## Visual Feedback

### Pulse Animation
```typescript
pulseAnimation: true
```
- Scales object 1.0 → 1.1 → 1.0
- 800ms per cycle
- Loops continuously
- Stops after interaction (if one-time)

### Glow Effect
```typescript
glowColor: '#FFD700'
```
- Fades 0 → 0.4 opacity
- 1000ms per cycle
- Colored background glow
- Stops after interaction (if one-time)

### Debug Mode
In development, objects without images show dashed outlines for positioning.

## Integration Examples

### Basic Scene with Interactive Object

```typescript
const scene: StoryScene = {
  id: 'room_1',
  text: 'You enter a dusty room...',
  backgroundImageUri: 'file://room.jpg',
  characters: [],
  choices: [],
  interactiveObjects: [
    {
      id: 'obj_key',
      name: 'Key on Table',
      position: { x: 45, y: 60, width: 10, height: 10 },
      pulseAnimation: true,
      glowColor: '#FFD700',
      oneTimeOnly: true,
      actions: [
        {
          type: 'add_item',
          item: {
            id: 'key_001',
            name: 'Rusty Key',
            description: 'An old key',
            iconUri: 'file://key.png'
          },
          showNotification: true
        },
        {
          type: 'dialogue',
          text: 'You picked up a rusty key.',
          speaker: 'Narrator'
        }
      ]
    }
  ]
};
```

### Locked Door Example

```typescript
{
  id: 'obj_door',
  name: 'Locked Door',
  position: { x: 40, y: 30, width: 20, height: 40 },
  requiredItems: ['key_001'],
  actions: [
    {
      type: 'dialogue',
      text: 'The door is locked. You need a key.'
    },
    {
      type: 'scene_transition',
      targetSceneId: 'room_2',
      transition: 'fade'
    }
  ]
}
```

## Persistence

### Inventory
- Stored in AsyncStorage
- Key: `inventory`
- Auto-saves on changes
- Loads on app start

### Interactive Object State
- One-time clicks tracked per session
- Resets on app restart
- Can be extended to persist if needed

## Performance Considerations

### Optimization Tips
1. Limit objects per scene (< 10 recommended)
2. Use small image files for icons
3. Avoid complex animations on many objects
4. Use percentage positioning (no recalculation needed)

### Memory Usage
- Each object: ~1-2KB
- Each inventory item: ~0.5-1KB
- Typical scene: < 20KB total

## Testing Checklist

- [x] Object click detection
- [x] Position rendering (all screen sizes)
- [x] Action execution (all types)
- [x] Inventory add/remove
- [x] Required items check
- [x] One-time interaction
- [x] Pulse animation
- [x] Glow effect
- [x] Item notifications
- [x] Inventory UI
- [x] Persistence
- [x] Editor integration

## Future Enhancements

### Planned Features
- [ ] Drag-and-drop positioning in editor
- [ ] Visual preview in editor
- [ ] Animation sequences
- [ ] Conditional visibility
- [ ] Item combinations
- [ ] Quest system integration
- [ ] Achievement triggers
- [ ] Mini-games integration

### Advanced Actions
- [ ] Variable manipulation
- [ ] Conditional branching
- [ ] Timer-based actions
- [ ] Multi-step interactions
- [ ] Puzzle mechanics

## Conclusion

The interactive objects and inventory system provides:
- ✅ Clickable objects with visual feedback
- ✅ Multiple action types
- ✅ Full inventory management
- ✅ Persistent storage
- ✅ Scene editor integration
- ✅ Responsive positioning
- ✅ Conditional interactions
- ✅ Preset templates

Ready for production use in visual novel games!
