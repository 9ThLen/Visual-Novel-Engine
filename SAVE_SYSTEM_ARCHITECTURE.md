# Save/Load System Architecture

## Overview

Full-featured save/load system for visual novel with multiple save slots, auto-save, and rich preview information.

## Architecture

### 1. Data Layer (`lib/story-context.tsx`)

**State Management:**
- Uses React Context + useReducer for global state
- Persists to AsyncStorage (React Native local storage)
- Automatic data loading on app start

**Key Functions:**
```typescript
saveGame(slotId: string)    // Save to specific slot
autoSave()                   // Auto-save to special slot
loadGame(slotId: string)     // Load from slot
deleteGame(slotId: string)   // Delete save slot
```

### 2. Data Structure

**SaveSlot Interface:**
```typescript
interface SaveSlot {
  id: string;                // Slot identifier (slot-1, slot-2, ..., autosave)
  storyId: string;           // Story being played
  sceneId: string;           // Current scene
  choicesMade: Array<{       // Player's choice history
    sceneId: string;
    choiceId: string;
  }>;
  timestamp: number;         // Save time (milliseconds)
  sceneName?: string;        // Scene identifier
  thumbnailUri?: string;     // Background image for preview
  storyTitle?: string;       // Story title for display
  sceneText?: string;        // First line of dialogue (preview)
  playTime?: number;         // Total play time (future feature)
}
```

### 3. Storage Strategy

**AsyncStorage Keys:**
- `saveSlots` - Array of all save slots
- `stories` - Available stories
- `settings` - User preferences

**Slot Organization:**
- Manual slots: `slot-1` through `slot-10` (10 slots)
- Auto-save: `autosave` (special slot)

### 4. UI Layer (`app/save-load.tsx`)

**Features:**
- Tab-based interface (Load / Save)
- Visual preview cards with thumbnails
- Relative timestamps ("2h ago", "3d ago")
- Empty slot indicators
- Confirmation dialogs for deletion

**UI Components:**
```
┌─────────────────────────────────┐
│  Save Game / Load Game          │
│  [Back]                         │
├─────────────────────────────────┤
│  [Load Tab] [Save Tab]          │
├─────────────────────────────────┤
│  ⚡ AUTO-SAVE                    │
│  ┌───────────────────────────┐  │
│  │ [Thumbnail Preview]       │  │
│  │ Story Title               │  │
│  │ "First line of dialogue..." │
│  │ 📍 scene_id • 5 choices   │  │
│  │ [📂 Load] [🗑]            │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  💾 MANUAL SAVES                │
│  ┌───────────────────────────┐  │
│  │ Slot 1                    │  │
│  │ ...                       │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### 5. Auto-Save System

**Trigger Points:**
- Scene transitions (after 500ms delay)
- Automatic, no user interaction needed

**Implementation:**
```typescript
// In reader.tsx
const navigateToScene = (sceneId: string) => {
  // ... update scene
  setTimeout(() => {
    autoSave();
  }, 500);
};
```

### 6. Save Process Flow

```
User clicks "Save" button
         ↓
Validate current game state
         ↓
Extract scene information:
  - Scene ID
  - Background image
  - First line of dialogue
  - Choice history
         ↓
Create SaveSlot object
         ↓
Update saveSlots array
         ↓
Persist to AsyncStorage
         ↓
Update UI
```

### 7. Load Process Flow

```
User clicks "Load" button
         ↓
Retrieve SaveSlot from storage
         ↓
Create PlaybackState from slot:
  - storyId
  - sceneId
  - choicesMade
         ↓
Update global state
         ↓
Navigate to reader screen
         ↓
Reader loads scene from state
```

## Key Features

### ✅ Multiple Save Slots
- 10 manual save slots
- 1 auto-save slot
- Overwrite protection with confirmation

### ✅ Rich Preview Information
- Thumbnail from scene background
- Story title
- Scene preview text
- Choice count
- Relative timestamps

### ✅ Auto-Save
- Automatic on scene change
- Separate from manual saves
- Always available in Load tab

### ✅ Data Persistence
- AsyncStorage for local persistence
- Survives app restarts
- JSON serialization

### ✅ Mobile-Optimized UI
- Touch-friendly buttons
- Visual card layout
- Smooth scrolling
- Responsive design

## Usage Examples

### Save Game
```typescript
import { useStory } from '@/lib/story-context';

function MyComponent() {
  const { saveGame } = useStory();
  
  const handleSave = async () => {
    await saveGame('slot-1');
    Alert.alert('Saved!');
  };
}
```

### Load Game
```typescript
import { useStory } from '@/lib/story-context';

function MyComponent() {
  const { loadGame } = useStory();
  
  const handleLoad = async () => {
    await loadGame('slot-1');
    router.push('/reader');
  };
}
```

### Auto-Save
```typescript
import { useStory } from '@/lib/story-context';

function ReaderComponent() {
  const { autoSave } = useStory();
  
  useEffect(() => {
    // Auto-save on scene change
    autoSave();
  }, [currentSceneId]);
}
```

## Future Enhancements

### Planned Features
- [ ] Cloud sync (Google Drive, iCloud)
- [ ] Play time tracking
- [ ] Save file export/import
- [ ] Screenshot capture for thumbnails
- [ ] Save file compression
- [ ] Multiple save profiles
- [ ] Quick save/load hotkeys

### Performance Optimizations
- [ ] Lazy loading of thumbnails
- [ ] Save file size optimization
- [ ] Background save operations
- [ ] Save queue for rapid saves

## Testing Checklist

- [x] Save to empty slot
- [x] Overwrite existing slot
- [x] Load from slot
- [x] Delete slot with confirmation
- [x] Auto-save on scene change
- [x] Persistence after app restart
- [x] Multiple concurrent saves
- [x] UI updates after save/load/delete
- [x] Thumbnail display
- [x] Timestamp formatting

## Technical Notes

### AsyncStorage Limits
- No hard limit on React Native
- Recommended: Keep individual saves < 2MB
- Current implementation: ~10-50KB per slot

### Error Handling
- Try-catch blocks on all storage operations
- Console logging for debugging
- Graceful degradation on errors

### Performance
- Saves are async (non-blocking)
- UI updates immediately
- Storage writes in background

## Conclusion

The save/load system is fully functional with:
- ✅ Multiple save slots (10 manual + 1 auto)
- ✅ Rich preview information
- ✅ Auto-save functionality
- ✅ Persistent storage
- ✅ Mobile-optimized UI
- ✅ Confirmation dialogs
- ✅ Visual thumbnails

Ready for production use!
