# Character System Documentation

## Overview

Comprehensive character management system with sprite library, animations, and positioning for visual novels.

## Features

### ✅ Character Library
- Per-story character library
- Multiple sprites per character (emotions, outfits)
- Tag-based organization (emotion, outfit, etc.)
- Default sprite selection
- Search and filter capabilities

### ✅ Character Actions
- **Show** - Display character with animation
- **Hide** - Remove character with animation
- **Move** - Reposition character
- **Change Sprite** - Switch to different emotion/outfit
- **Animate** - Apply animation effect

### ✅ Positioning System
- **Far Left** - 35% from left edge
- **Left** - 20% from left edge
- **Center** - Screen center
- **Right** - 20% from right edge
- **Far Right** - 35% from right edge

### ✅ Animation Types
- **Instant** - No animation
- **Fade** - Fade in/out
- **Slide** - Slide from side
- **Zoom** - Zoom in with scale
- **Shake** - Shake effect

### ✅ Advanced Features
- Animation duration control
- Delay before animation
- Scale adjustment
- Opacity control
- Z-index layering
- Screen shake effect

## Architecture

### Data Flow

```
Story
  ↓
Character Library (per-story)
  ├─ Character 1
  │  ├─ Sprite: Happy
  │  ├─ Sprite: Sad
  │  └─ Sprite: Angry
  ├─ Character 2
  │  ├─ Sprite: Casual
  │  └─ Sprite: Formal
  ↓
Scene
  ↓
Character Actions
  ├─ show (with animation)
  ├─ hide
  ├─ move
  ├─ change_sprite
  └─ animate
  ↓
Character Animator
  ↓
Animated Display
```

### Type Definitions

```typescript
// Character in library
interface Character {
  id: string;
  name: string;
  sprites: CharacterSprite[];
  defaultSpriteId?: string;
  createdAt: number;
}

// Sprite (emotion/outfit)
interface CharacterSprite {
  id: string;
  name: string;
  uri: string;
  tags?: string[];
  createdAt: number;
}

// Action to execute
interface CharacterAction {
  id: string;
  type: 'show' | 'hide' | 'move' | 'change_sprite' | 'animate';
  characterId: string;
  spriteId?: string;
  position?: CharacterPosition;
  animation?: CharacterAnimation;
  scale?: number;
  opacity?: number;
  zIndex?: number;
}

// Animation settings
interface CharacterAnimation {
  transition: 'instant' | 'fade' | 'slide' | 'zoom' | 'shake';
  duration?: number; // milliseconds
  delay?: number; // milliseconds
}
```

## Usage Examples

### 1. Create Character Library

```typescript
import * as characterLibrary from '@/lib/character-library';

// Add character
const alice = await characterLibrary.addCharacter(storyId, {
  name: 'Alice',
  sprites: [],
});

// Add sprites
const happySprite = await characterLibrary.addSpriteToCharacter(
  storyId,
  alice.id,
  {
    name: 'Happy',
    uri: 'file:///path/to/alice_happy.png',
    tags: ['emotion', 'happy'],
  }
);

const sadSprite = await characterLibrary.addSpriteToCharacter(
  storyId,
  alice.id,
  {
    name: 'Sad',
    uri: 'file:///path/to/alice_sad.png',
    tags: ['emotion', 'sad'],
  }
);
```

### 2. Show Character with Animation

```typescript
const showAction: CharacterAction = {
  id: 'action_1',
  type: 'show',
  characterId: 'char_alice',
  spriteId: 'sprite_happy',
  position: 'left',
  animation: {
    transition: 'slide',
    duration: 500,
    delay: 0,
  },
  scale: 1,
  opacity: 1,
  zIndex: 1,
};
```

### 3. Change Character Emotion

```typescript
const changeAction: CharacterAction = {
  id: 'action_2',
  type: 'change_sprite',
  characterId: 'char_alice',
  spriteId: 'sprite_sad',
  animation: {
    transition: 'fade',
    duration: 300,
  },
};
```

### 4. Move Character

```typescript
const moveAction: CharacterAction = {
  id: 'action_3',
  type: 'move',
  characterId: 'char_alice',
  position: 'center',
  animation: {
    transition: 'slide',
    duration: 400,
  },
};
```

### 5. Hide Character

```typescript
const hideAction: CharacterAction = {
  id: 'action_4',
  type: 'hide',
  characterId: 'char_alice',
  animation: {
    transition: 'fade',
    duration: 300,
  },
};
```

### 6. Shake Effect

```typescript
const shakeAction: CharacterAction = {
  id: 'action_5',
  type: 'animate',
  characterId: 'char_alice',
  animation: {
    transition: 'shake',
    duration: 250,
  },
};
```

## UI Components

### CharacterLibraryManager

Manages character library with split-panel interface.

```tsx
import { CharacterLibraryManager } from '@/components/CharacterLibraryManager';

<CharacterLibraryManager
  storyId={story.id}
  visible={showLibrary}
  onClose={() => setShowLibrary(false)}
  onSelectSprite={(character, sprite) => {
    console.log('Selected:', character.name, sprite.name);
  }}
/>
```

**Features:**
- Left panel: Character list
- Right panel: Sprite list for selected character
- Add/edit/delete characters and sprites
- Tag management
- Search functionality

### CharacterActionEditor

Visual editor for character actions in scenes.

```tsx
import { CharacterActionEditor } from '@/components/CharacterActionEditor';

<CharacterActionEditor
  storyId={story.id}
  actions={scene.characterActions}
  onChange={(newActions) => {
    updateScene({ ...scene, characterActions: newActions });
  }}
/>
```

**Features:**
- Action type selection
- Position picker
- Animation type selector
- Duration and delay controls
- Scale and opacity settings

### CharacterDisplay

Renders animated characters in story reader.

```tsx
import { CharacterDisplay } from '@/components/CharacterDisplay';

<CharacterDisplay
  instance={animatedInstance}
  spriteUri={sprite.uri}
/>
```

## API Reference

### Character Library Functions

```typescript
// Get library
getCharacterLibrary(storyId: string): Promise<Character[]>

// Add character
addCharacter(storyId: string, character: Omit<Character, 'id' | 'createdAt'>): Promise<Character>

// Update character
updateCharacter(storyId: string, characterId: string, updates: Partial<Character>): Promise<void>

// Delete character
deleteCharacter(storyId: string, characterId: string): Promise<void>

// Add sprite
addSpriteToCharacter(storyId: string, characterId: string, sprite: Omit<CharacterSprite, 'id' | 'createdAt'>): Promise<CharacterSprite>

// Update sprite
updateSprite(storyId: string, characterId: string, spriteId: string, updates: Partial<CharacterSprite>): Promise<void>

// Delete sprite
deleteSprite(storyId: string, characterId: string, spriteId: string): Promise<void>

// Search
searchCharacters(storyId: string, query: string): Promise<Character[]>
searchSprites(storyId: string, characterId: string, query: string): Promise<CharacterSprite[]>
getSpritesByTag(storyId: string, characterId: string, tag: string): Promise<CharacterSprite[]>

// Import/Export
importCharacterLibrary(targetStoryId: string, sourceStoryId: string): Promise<void>
exportCharacterLibrary(storyId: string): Promise<string>
importCharacterLibraryFromJSON(storyId: string, json: string): Promise<void>
```

### Character Animator Functions

```typescript
// Create animated instance
createAnimatedInstance(instance: CharacterInstance, screenWidth: number): AnimatedCharacterInstance

// Create animation
createCharacterAnimation(instance: AnimatedCharacterInstance, action: CharacterAction, screenWidth: number): Animated.CompositeAnimation | null

// Create hide animation
createHideAnimation(instance: AnimatedCharacterInstance, transition: CharacterTransition, duration: number): Animated.CompositeAnimation

// Create screen shake
createScreenShakeAnimation(shakeValue: Animated.Value, intensity: number, duration: number): Animated.CompositeAnimation

// Get position offset
getPositionOffset(position: CharacterPosition): number
```

## Integration Guide

### Step 1: Add to Scene Editor

```tsx
import { CharacterActionEditor } from '@/components/CharacterActionEditor';

// In scene editor component
<CharacterActionEditor
  storyId={story.id}
  actions={scene.characterActions || []}
  onChange={(actions) => {
    updateScene({ ...scene, characterActions: actions });
  }}
/>
```

### Step 2: Add to Story Reader

```tsx
import { CharacterDisplay } from '@/components/CharacterDisplay';
import { createAnimatedInstance, createCharacterAnimation } from '@/lib/character-animator';
import { getCharacterLibrary, getSprite } from '@/lib/character-library';

// Load library
useEffect(() => {
  async function loadCharacters() {
    const library = await getCharacterLibrary(story.id);
    setCharacterLibrary(library);
  }
  loadCharacters();
}, [story.id]);

// Execute actions on scene start
useEffect(() => {
  if (!currentScene?.characterActions) return;
  
  for (const action of currentScene.characterActions) {
    executeCharacterAction(action);
  }
}, [currentScene?.id]);

// Render characters
{activeCharacters.map((instance) => (
  <CharacterDisplay
    key={instance.id}
    instance={instance}
    spriteUri={getSpriteUri(instance)}
  />
))}
```

## Import/Export

### Export Library

```typescript
const json = await exportCharacterLibrary(storyId);
// Save to file or share
```

### Import from Another Story

```typescript
await importCharacterLibrary(targetStoryId, sourceStoryId);
```

### Import from JSON

```typescript
const json = '{"characters": [...]}';
await importCharacterLibraryFromJSON(storyId, json);
```

## Best Practices

### Organization
- Use descriptive sprite names (Happy, Sad, Angry)
- Tag sprites by category (emotion, outfit, special)
- Set default sprite for each character
- Keep sprite dimensions consistent

### Performance
- Optimize image sizes (recommended: 300-500px width)
- Use PNG with transparency
- Preload frequently used sprites
- Limit simultaneous characters (3-4 max)

### Animation
- Use fade for subtle transitions (300ms)
- Use slide for dramatic entrances (500ms)
- Use zoom for emphasis (400ms)
- Use shake sparingly for impact (250ms)
- Add delays to sequence multiple actions

### Positioning
- Use far-left/far-right for background characters
- Use left/right for main characters
- Use center for single character focus
- Adjust z-index for layering (0-10)

## Examples

### Example 1: Character Enters Scene

```typescript
const actions: CharacterAction[] = [
  {
    id: 'enter_alice',
    type: 'show',
    characterId: 'char_alice',
    spriteId: 'sprite_happy',
    position: 'left',
    animation: {
      transition: 'slide',
      duration: 500,
    },
    scale: 1,
    opacity: 1,
    zIndex: 1,
  },
];
```

### Example 2: Two Characters Dialogue

```typescript
const actions: CharacterAction[] = [
  // Alice on left
  {
    id: 'show_alice',
    type: 'show',
    characterId: 'char_alice',
    spriteId: 'sprite_happy',
    position: 'left',
    animation: { transition: 'fade', duration: 300 },
    zIndex: 1,
  },
  // Bob on right (delayed)
  {
    id: 'show_bob',
    type: 'show',
    characterId: 'char_bob',
    spriteId: 'sprite_neutral',
    position: 'right',
    animation: { transition: 'slide', duration: 500, delay: 300 },
    zIndex: 1,
  },
];
```

### Example 3: Emotion Change

```typescript
const actions: CharacterAction[] = [
  {
    id: 'alice_sad',
    type: 'change_sprite',
    characterId: 'char_alice',
    spriteId: 'sprite_sad',
    animation: { transition: 'fade', duration: 200 },
  },
];
```

### Example 4: Dramatic Zoom

```typescript
const actions: CharacterAction[] = [
  {
    id: 'alice_zoom',
    type: 'show',
    characterId: 'char_alice',
    spriteId: 'sprite_shocked',
    position: 'center',
    animation: { transition: 'zoom', duration: 600 },
    scale: 1.2,
    zIndex: 2,
  },
];
```

## Status

✅ **All components implemented**
- Type definitions complete
- Library management working
- Animation system functional
- UI components created
- Documentation written

**Ready for integration into scene editor and story reader**

---

**Version:** 1.0.0  
**Date:** 2026-04-12  
**Status:** ✅ Production Ready
