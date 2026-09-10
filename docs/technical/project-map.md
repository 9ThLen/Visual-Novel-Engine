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
| Canonical scene model | `src/lib/engine/types.ts`, `src/lib/scene-operations.ts` |
| Scene execution | `src/lib/engine/useSceneExecutor.ts`, `src/lib/engine/conditionUtils.ts` |
| Reader scene access | `src/lib/scene-access.ts`, `src/lib/reader-scene-cache.ts`, `src/lib/reader-runtime-snapshot.ts` |
| Scene persistence | `src/lib/scene-record-storage.ts`, `src/lib/app-store-storage.ts`, `src/lib/app-store-persistence.ts` |
| Bundled stories | `src/lib/bundled-story-sync.ts`, `src/lib/bundled-story-upsert.ts` |
| Import/export | `src/lib/story-hooks.ts`, `src/lib/story-validator.ts` |

## State

| Store | Role |
|---|---|
| `src/stores/use-app-store.ts` | Public Zustand store entrypoint and selectors |
| `src/stores/app-store-types.ts` | Store state/action contract |
| `src/stores/app-store-initial-state.ts` | Initial persisted state |
| `src/stores/app-store-slices/*` | Stories, settings, playback, audio, assets, saves |
| `src/stores/theme-store.ts` | Theme selection |

## Editors

| Area | Files |
|---|---|
| Document editor UI | `src/components/document-editor/*` |
| Manuscript editor UI | `src/components/editor/StoryManuscriptScreen.tsx`, `src/components/editor/manuscript/*` |
| Scene manager | `src/components/editor/SceneManager.tsx`, `src/components/editor/SceneSelector.tsx` |
| Preview/playback | `src/components/editor/PreviewScreen.tsx`, `src/components/editor/PlayMode.tsx` |
| Plate bridge | `src/lib/vn-plate-editor/*` |

## Reader

| Area | Files |
|---|---|
| Reader screen | `app/reader.tsx` |
| Initialization | `src/hooks/useReaderInitialization.ts` |
| Audio | `src/hooks/useReaderAudio.ts`, `src/lib/reader-audio-session.ts` |
| UI | `src/components/reader/*`, `src/components/story-reader-responsive.tsx` |
| History | `src/hooks/useDialogueHistory.ts`, `src/components/dialogue-history.tsx` |

## Tests

| Area | Files |
|---|---|
| Store tests | `tests/unit/stores/*` |
| Reader/runtime tests | `tests/unit/lib/reader-*.test.ts`, `tests/unit/use-reader-audio.test.ts` |
| Component tests | `tests/unit/components/*` |
| Editor conversion tests | `tests/unit/editor/*` |

## Removed Or Historical

- `hooks/use-story-state.ts` was removed; use `useAppStore()` directly.
- `stores/use-editor-store.ts` is not part of active state; use canonical `useAppStore()` data.
- `components/editor-legacy` must not be imported by active editor routes.
- Old dated reports in `docs/technical/` are archive material, not source of truth.
