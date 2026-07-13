# AI Chat Integration Plan (v2)

Status: draft, revised after two external reviews (2026-07-12).
Scope: AI assistant chat in the document editor's right column, able to read the
active story, propose structured scene patches, and (later) generate images and
drive multiple agent providers (Claude Code first; Codex/Gemini deferred).

## Verified codebase facts this plan depends on

- No backend exists in the repo. All data lives in the Zustand store
  (`stores/use-app-store.ts` + slices) persisted via AsyncStorage/IndexedDB.
  `constants/oauth.ts` references a ":3000 API server" but that is template code
  for a cloud-sandbox URL pattern — no server ships with this repo.
- Undo/redo is **Plate-local** (editor refs in `DocumentSceneEditor.tsx`). The
  store has no undo stack; the only rollback primitive is
  `createStorySnapshot` / `restoreStorySnapshot` (`stores/app-store-slices/snapshots-slice.ts`).
- `lib/scene-operations.ts` operates on `CanonicalSceneOperationsSnapshot`
  objects. There is **no per-block timeline mutation**; scene writes go through
  `saveSceneRecord(record)` / `updateSceneRecordPreservingMeta(storyId, sceneId, updates)`.
- The right column is a single `DocumentInspectorPanel` (fixed width) with its
  own internal tabs `block | scene | issues`, rendered at
  `components/document-editor/DocumentSceneEditor.tsx:782`.
- `@imgly/background-removal` runs **in the browser** (app side), so
  `remove_background` must be an app-side tool, not a bridge tool.

## Core architecture

```
┌─ Browser (Expo web) ─────────────────┐      ┌─ AI Bridge (Node, 127.0.0.1) ──┐
│ Editor right column: [Inspector|AI]  │◄─WS─►│ Claude adapter (Agent SDK)     │
│                                      │      │  tools defined via in-process  │
│ App-side tool executor:              │      │  SDK MCP (createSdkMcpServer)  │
│  read DTOs + ScenePatch pipeline     │      │  → proxied to app over WS      │
│  + remove_background (ISNet)         │      │ Bridge-side tools (later):     │
└──────────────────────────────────────┘      │  generate_image / edit_image   │
                                              └────────────────────────────────┘
```

Decisions locked in v2:

1. **Rollback = snapshot-before-apply.** Every AI mutation first creates an
   automatic story snapshot (`AI: <capability> <time>`); rollback = restore it.
   No claim of Plate-undo integration. A "Відкотити AI-зміни" button lives on
   the applied-patch card. (Unifying with editor history is a later, optional
   phase.)
2. **Patch protocol, not raw CRUD.** No `update_scene_blocks(timeline[])` tool.
   Mutations are `AiScenePatch` objects:
   ```ts
   type AiScenePatch = {
     storyId: string;
     sceneId: string;
     expectedRevision: string;   // stable hash of scene content (fallback: updatedAt)
     operations: ScenePatchOperation[]; // insert_steps | replace_step |
                                        // delete_steps | update_scene_metadata |
                                        // set_connection
     explanation: string;
   };
   ```
   Operations address blocks by stable step id. Stale `expectedRevision` →
   `STALE_REVISION` error, agent must re-read the scene.
3. **Pure patch core, thin store adapter.** `lib/ai/scene-patch.ts` exposes
   `validateAiScenePatch`, `applyAiScenePatch`, `describeAiScenePatch` as pure
   functions (no Zustand). Validation reuses `story-validator` plus referential
   checks (scene/character/variable/asset ids, unique step ids). A thin adapter
   materializes the new full `SceneRecord` and calls `saveSceneRecord` — because
   that is the only write path the store actually has.
4. **Read model = DTOs, not store state.** `AiStoryContext { story: StorySummary;
   activeScene: AiSceneView; nearbyScenes: SceneSummary[] }`. Keeps context
   small, hides persistence fields, testable without UI.
5. **Confirmation is the only mode in v1.** The app (not the model) builds a
   structured diff from `describeAiScenePatch`: scenes touched, blocks
   added/removed/changed, validator warnings, Apply / Reject. No auto-apply.
6. **UI placement:** the right column becomes a container with two top-level
   tabs `Inspector | AI`; the existing `DocumentInspectorPanel` (with its
   internal block/scene/issues tabs) moves under `Inspector` unchanged. Chat
   gets full column height. All strings via `lib/translations.ts`.
7. **Tool split by execution site, one interface:**
   - app-side: all read DTOs, ScenePatch apply, `remove_background`;
   - bridge-side: `generate_image` / `edit_image` (external APIs, keys in the
     bridge `.env`, never in the browser).
8. **Versioned transport-agnostic protocol** over WS:
   ```ts
   { protocolVersion: 1, requestId, sessionId, type, payload }
   ```
   Structured errors: `VALIDATION_FAILED`, `STALE_REVISION`, `PERMISSION_DENIED`,
   `PROVIDER_UNAVAILABLE`, `CANCELLED`. Heartbeat + auto-reconnect + session
   resume on the client.

## Bridge security baseline (required before phase 1 ships)

- Listen on `127.0.0.1` only; LAN mode is a separate late phase (TLS + pairing).
- Random session token generated at startup; browser must present it; `Origin`
  check; max message size.
- Agent tool allowlist only — no shell, no filesystem, no `.env` exposure.
- Timeouts, cancel, max tool calls per turn; secret redaction in logs.

## Phases

**Phase 0 — ScenePatch core, no model.**
DTOs, revision hash, `validate/apply/describe` pure functions + unit tests,
snapshot-before-apply + rollback, diff-preview UI driven by a scripted fake
agent. Exit: apply/reject/rollback works end-to-end with zero AI.

**Phase 1 — Minimal bridge.**
`tools/ai-bridge/`: one provider (Claude Agent SDK), one session, streaming,
cancel, token auth, versioned protocol, heartbeat/reconnect. No image tools,
no multi-provider abstraction beyond a thin seam.

**Phase 2 — Read tools.**
`get_story_overview`, `list_scenes`, `get_scene` returning DTOs. Measure real
context size; trim `AiSceneView` accordingly.

**Phase 3 — First mutation capability.**
"Rewrite the active scene's dialogue": model emits `AiScenePatch`, app shows
structured diff, revision conflict handling, apply/rollback. This is the MVP.

**Phase 4 — More story capabilities, one at a time.**
`create_scene`, `set_connection`, characters, variables — each with its own
invariant tests.

**Phase 5 — Second provider.**
Codex (`codex exec --json`/SDK) or Gemini CLI. Only now solidify `AgentAdapter`
from two real implementations. Tool definitions move behind a shared seam
(standalone MCP server only if a provider needs it).

**Phase 6 — Images.**
Bridge-side `generate_image`/`edit_image` as a workflow: cost estimate,
progress, cancel, temporary result, explicit confirm before adding to the
story image library (`lib/story-image-library.ts`). App-side
`remove_background` reuses the existing ISNet pipeline.

**Deferred out of MVP:** Codex/Gemini adapters, standalone MCP server, image
generation, LAN/mobile mode, persistent chat history, auto-apply, markdown
renderer (plain text first), full CRUD tool set.

## MVP acceptance criteria

The MVP is done when a user can:
1. Open the active scene and ask to rewrite its dialogue.
2. See a structured diff built by the app.
3. Apply or reject it.
4. Not lose concurrent manual edits (stale revision is rejected, model re-reads).
5. Roll back the whole AI operation via snapshot restore.
6. Get a clear error state when the bridge or provider is down.
