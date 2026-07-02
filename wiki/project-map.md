# Project Map

Current high-level map for the Visual Novel Engine codebase.

## App Routes

| Path | Role |
|---|---|
| `app/_layout.tsx` | Root providers, error boundary, autosave, audio route guard |
| `app/tabs/index.tsx` | Home screen, hydration, legacy migration, bundled demo sync |
| `app/document-editor.tsx` | Main Plate/document scene editor route |
| `app/manuscript-editor.tsx` | Manuscript-style story editor route |
| `app/scene-manager.tsx` | Scene list, create/duplicate/delete, start-scene management |
| `app/preview.tsx` | Scene preview through `useSceneExecutor` |
| `app/reader.tsx` | Reader route with lazy scene window hydration |
| `app/save-load.tsx` | Save/load, import/export |
| `app/settings.tsx` | User settings |

## Runtime And Data

| Area | Files |
|---|---|
| Canonical scene model | `lib/engine/types.ts`, `lib/scene-operations.ts` |
| Scene execution | `lib/engine/useSceneExecutor.ts`, `lib/engine/conditionUtils.ts` |
| Reader scene access | `lib/scene-access.ts`, `lib/reader-scene-cache.ts`, `lib/reader-runtime-snapshot.ts` |
| Scene persistence | `lib/scene-record-storage.ts`, `lib/app-store-storage.ts`, `lib/app-store-persistence.ts` |
| Bundled stories | `lib/bundled-story-sync.ts`, `lib/bundled-story-upsert.ts` |
| Import/export | `lib/story-hooks.ts`, `lib/story-validator.ts` |

## State

| Store | Role |
|---|---|
| `stores/use-app-store.ts` | Public Zustand store entrypoint and selectors |
| `stores/app-store-types.ts` | Store state/action contract |
| `stores/app-store-initial-state.ts` | Initial persisted state |
| `stores/app-store-slices/*` | Stories, settings, playback, audio, assets, saves |
| `stores/theme-store.ts` | Theme selection |

## Editors

| Area | Files |
|---|---|
| Document editor UI | `components/document-editor/*` |
| Manuscript editor UI | `components/editor/StoryManuscriptScreen.tsx`, `components/editor/manuscript/*` |
| Scene manager | `components/editor/SceneManager.tsx`, `components/editor/SceneSelector.tsx` |
| Preview/playback | `components/editor/PreviewScreen.tsx`, `components/editor/PlayMode.tsx` |
| Plate bridge | `lib/vn-plate-editor/*` |

## Reader

| Area | Files |
|---|---|
| Reader screen | `app/reader.tsx` |
| Initialization | `hooks/useReaderInitialization.ts` |
| Audio | `hooks/useReaderAudio.ts`, `lib/reader-audio-session.ts` |
| UI | `components/reader/*`, `components/story-reader-responsive.tsx` |
| History | `hooks/useDialogueHistory.ts`, `components/dialogue-history.tsx` |

## Tests

| Area | Files |
|---|---|
| Store tests | `__tests__/unit/stores/*` |
| Reader/runtime tests | `__tests__/unit/lib/reader-*.test.ts`, `__tests__/unit/use-reader-audio.test.ts` |
| Component tests | `__tests__/unit/components/*` |
| Editor conversion tests | `__tests__/unit/editor/*` |

## Removed Or Historical

- `hooks/use-story-state.ts` was removed; use `useAppStore()` directly.
- `stores/use-editor-store.ts` is not part of active state; use canonical `useAppStore()` data.
- `components/editor-legacy` must not be imported by active editor routes.
- Old dated reports in `wiki/` are archive material, not source of truth.
