# Довідник архітектури Visual Novel Engine

**Оновлено:** 2026-05-24  
**Призначення:** короткий current-state reference для active production architecture

## 1. Канонічна модель

- `SceneRecord + TimelineStep` — єдиний steady-state contract для editor, preview, reader, save/load і StoryFlow
- `Story` і `StoryScene` — compatibility-only типи для import/export та контрольованих migration boundary
- `storiesMetadata.startSceneId` — canonical source of truth для стартової сцени

Ключові файли:
- `lib/engine/types.ts`
- `lib/canonical-scene.ts`
- `lib/scene-operations.ts`
- `docs/SCENE-MODEL-CONTRACT.md`

## 2. Основні шари

### App State

- `stores/use-app-store.ts` — persisted app state, story metadata, canonical scene records, save/load, scene operations
- `stores/use-editor-store.ts` — in-memory draft state для поточної сцени

### Canonical Helpers

- `lib/runtime-story.ts` — runtime snapshot, preview timeline, save/load helpers
- `lib/story-flow-graph.ts` — derived nodes/edges для StoryFlow
- `lib/editor-scene-draft.ts` — hydration/save helpers для editor draft
- `lib/scene-record-adapter.ts` — explicit compatibility adapter, не primary production path

### UI Routes

- `app/editor.tsx` — список історій і canonical story creation entry point
- `app/scene-editor.tsx` — scene editor route
- `app/scene-manager.tsx` — scene CRUD route
- `app/story-flow.tsx` — graph route
- `app/reader.tsx` — runtime reader
- `app/save-load.tsx` — manual save/load

## 3. Поточний data flow

### Story Creation

1. `editor.tsx` викликає canonical story creation path
2. Store створює `storiesMetadata` + persisted start scene record
3. Route відкриває `scene-editor.tsx` для нової canonical сцени

### Scene Editing

1. `scene-editor.tsx` читає canonical scene record
2. `SceneComposer` гідрує `useEditorStore`
3. Save йде назад у `useAppStore.saveSceneRecord(...)`
4. Metadata, graph position і connections не губляться

### Runtime / Preview / Save

1. Preview читає persisted canonical scene через `runtime-story.ts`
2. Reader ініціалізується через canonical start-scene resolution
3. Autosave і manual save/load будують runtime snapshots з canonical data

### Story Flow

1. `StoryFlowScreen` отримує derived graph з `story-flow-graph.ts`
2. Node positions зберігаються в `flowX/flowY`
3. Connections проходять через store actions
4. Start-scene sync іде через `scene-operations.ts`

## 4. Compatibility Boundary

Compatibility шар лишається лише тут:
- legacy import/export flows у `lib/story-hooks.ts`
- adapter conversion у `lib/scene-record-adapter.ts`
- контрольований migration path у `use-app-store.ts`

Що не є більше primary architecture:
- React Context як source of truth для stories/runtime
- Node Editor як основний graph editor
- implicit fallback із runtime/editor selectors у legacy `StoryScene`

## 5. Verification Focus

Critical-path verification для поточного milestone:
- create -> open -> edit -> save -> reopen
- preview -> play -> autosave -> manual save/load
- scene CRUD -> StoryFlow drag/connect/remove -> set start

Актуальні phase artifacts:
- `.planning/phases/01-canonical-scene-model/*`
- `.planning/phases/02-editor-load-save-stability/*`
- `.planning/phases/03-runtime-and-persistence-alignment/*`
- `.planning/phases/04-story-flow-and-scene-operations/*`
- `.planning/phases/05-legacy-cleanup-and-quality-gate/*`
