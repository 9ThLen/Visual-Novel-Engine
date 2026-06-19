# Changelog

## 2026-06-15 — GSD Fix Round

### Hardcoded Colors Fixed
- `components/editor/PreviewScreen.tsx:237` — replaced `#fff` → `colors.surface` (flash effect)
- `components/reader/ReaderDisplay.tsx:233` — replaced `#ffffff` → `colors.surface` (flash effect)
- `components/reader/ReaderDisplay.tsx:255` — replaced `#ffffff` → `colors.foreground` (cursor)
- `components/editor/PreviewScreen.tsx:238` — replaced `rgba(0,0,0,0.32)` → `withAlpha(colors.foreground, 0.32)` (vignette)
- `components/reader/ReaderDisplay.tsx:238` — replaced `rgba(0,0,0,0.32)` → `withAlpha(colors.foreground, 0.32)` (vignette)

### Layer Boundary Violations Fixed (6 files)
- `lib/story-hooks.ts` — extracted `useStoryState()`/`useStoryActions()` → `hooks/use-story-state.ts`
- `lib/audio-library.ts` — extracted store access → `stores/audio-library-actions.ts`
- `lib/media-library-service.ts` — extracted store access → `stores/media-library-actions.ts`
- `lib/character-library.ts` — converted to pure functions (store access via parameters)
- `lib/i18n.ts` — moved `useI18n()` → `hooks/use-i18n.ts`
- `lib/theme-provider.tsx` — documented as acceptable exception (React component .tsx)

### Import Migrations
- `hooks/useAutoSave.ts` — migrated from `lib/types.ts` → domain modules (`@/lib/engine/types`, `@/lib/story-domain`)
- `hooks/useReaderAudio.ts` — migrated `useFocusEffect` from `@react-navigation/native` → `expo-router`
- 8 files migrated from `@/lib/story-hooks` → `@/hooks/use-story-state`
- 3 files migrated from `@/lib/media-library-service` → `@/stores/media-library-actions`

### Tests
- Created `__tests__/unit/lib/auth.test.ts` — unit tests for `isValidUser()`, `generateOAuthState()`
- Note: Test runner blocked by esbuild version mismatch (0.21.5 vs 0.28.0) — infrastructure issue, not code

### Documentation
- Updated `wiki/hooks-reference.md` — added `useStoryState`, `useStoryActions`, `useI18n` sections
- Created `wiki/changelog.md`

### Not Touched (Plate Editor)
- `lib/vn-plate-editor/` — untouched (Plate editor in progress)
- `lib/document-editor/` — untouched (Plate editor in progress)
- `components/document-editor/` — untouched (Plate editor in progress)
- `components/editor/SceneComposer*.tsx` — untouched (uses document-editor)
- `lib/editor/story-manuscript*.ts` — untouched (uses document-editor)
