# Visual Novel Engine - Project Overview

**Type:** Cross-platform mobile/web application
**Framework:** React Native + Expo 54
**Language:** TypeScript 5.9
**Status:** Production-ready, actively developed

## What It Is

A comprehensive visual novel engine that enables creators to build, edit, and play interactive branching narrative stories. Combines professional authoring tools with an immersive reading experience, all in a single cross-platform application.

## Core Capabilities

### Story Creation
- Visual node-based editor for mapping story flow
- Rich scene editor with media integration
- Branching narrative system with player choices
- Real-time preview and testing

### Story Reading
- Typewriter text effects
- Character sprites with positioning
- Background images and music
- Voice acting support
- Save/load system (10 slots + auto-save)

### Advanced Features
- **Interactive Objects** - Clickable elements in scenes with multiple action types
- **Inventory System** - Item collection and conditional interactions
- **Splash Screens** - Image/video transitions between scenes
- **Multilingual** - English, Ukrainian, Russian with easy extensibility
- **Help System** - Contextual tooltips and guided tours

## Technical Architecture

### UI/UX
- Beige color theme (light/dark modes)
- Haptic feedback on all interactions
- Sound effects system with graceful degradation
- Responsive design for phones and tablets
- WCAG AA accessibility compliance

### State Management
- React Context API for global state
- AsyncStorage for persistence
- Separate contexts for stories, inventory, i18n, help

### Key Technologies
- **Routing:** Expo Router 6
- **Styling:** NativeWind 4 (Tailwind CSS)
- **Audio:** expo-av
- **Haptics:** expo-haptics
- **Images:** expo-image

## Project Structure

```
app/                    # Screens (Expo Router)
components/             # React components
lib/                    # Core logic and contexts
assets/                 # Media files
wiki/                   # Knowledge base (this)
```

## Current State

- ✅ All core features implemented
- ✅ TypeScript compilation: 0 errors
- ✅ ESLint: 0 errors, 46 warnings (non-blocking)
- ✅ Comprehensive demo story with full asset library
- ✅ Production build in progress (EAS Build)
- ✅ GitHub repository published

## Key Files

- `README.md` - Full feature documentation
- `lib/types.ts` - Core TypeScript types
- `lib/story-context.tsx` - Story state management
- `assets/demo-story-advanced.json` - Comprehensive demo

## Development Context

Built collaboratively with Claude Sonnet 4. Recent work focused on:
- Production readiness (error fixes, build prep)
- UI sound effects integration
- Advanced demo story creation
- Complete asset library (backgrounds, characters, audio)

## Related Pages

- [Story Engine](entities/story-engine.md) - Core narrative system
- [Save System](entities/save-system.md) - Persistence layer
- [Interactive Objects](entities/interactive-objects.md) - Clickable scene elements
- [Inventory System](entities/inventory-system.md) - Item management

---

**Created:** 2026-04-13
**Last Updated:** 2026-04-13
**Sources:** README.md, project structure, recent development session
