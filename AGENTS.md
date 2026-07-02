# AGENTS.md - Visual Novel Engine

Keep responses short and practical.

## Context7

Use Context7 MCP when library API details are uncertain, a library is new, API versions may differ, exact parameter/return types matter, or examples are needed.

Flow:
1. Call `resolve-library-id` with the library name.
2. Call `query-docs` with the resolved ID and a focused question.

Context7 takes priority over memory for API details.

## Working Rules

- When the same error happens twice, stop guessing. Research 3-5 plausible fixes, then choose the best one.
- Plate/document editing is the active scene editing system. Active editor screens must not import `components/editor-legacy` or `stores/use-editor-store`.
- Use Zustand directly through `useAppStore()`. Do not add React Context for app state.
- `initializeApp()` must wait for `useAppStore.persist.onFinishHydration()` before `migrateFromLegacyKeys()`.
- Demo story sync must run after migration, even when storage seeding fails.
- `migrateFromLegacyKeys()` must not replace hydrated persisted data with empty arrays. Prefer existing hydrated data when legacy arrays are empty.
- `StoryAutoSave` must not call `migrateFromLegacyKeys()`; HomeScreen owns migration.
- Do not import `@react-native-async-storage/async-storage` directly. Use `createPersistentStorage()` from `lib/persistent-storage.ts`.
- `SplashScreen.preventAutoHideAsync()` must run from `useEffect` through dynamic import; module-level calls can hang web.
- Reanimated can fail on web when imported at module level. Use guarded require/import patterns where needed.
- Add hex/rgb fallbacks before `oklch()` for browser compatibility.
- Do not use `await import()` for modules already statically imported, such as `useAppStore`.

## Known Platform Notes

- `vars()` from NativeWind is supported on Android.
- NativeWind `active:` on `Pressable` can block `onPress`. Use the existing remap/wrapper pattern.

## Current Architecture Notes

- Canonical scene data is `SceneRecord + TimelineStep`.
- Legacy `Story`, `StoryScene`, and `Choice` remain only for JSON import and old storage migration.
- Reader and preview execute scenes through `useSceneExecutor`.
- Reader scene access should go through `lib/scene-access.ts` and reader cache helpers.
- Bundled demo sync uses canonical payloads from `lib/bundled-story-upsert.ts`.

## graphify

This project has a knowledge graph at `graphify-out/`.

Rules:
- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists.
- Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts.
- Dirty `graphify-out/` files are expected after hooks or updates; this is not a reason to skip graphify.
- Use `graphify-out/wiki/index.md` for broad navigation when it exists.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain are insufficient.
- After modifying code, run `graphify update .` to keep the graph current.
