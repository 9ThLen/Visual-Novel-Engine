# AI Chat Round 2 — Delegation Prompts (packages E–N), v4.2

Revised 2026-07-15 (v4.2) after a fourth review round (v4.1 was a
self-review pass). Each prompt is
self-contained: paste it into the target model with the files it lists.
Rules for EVERY package:

- Test runner is **vitest** (`pnpm test`). Never jest. Typecheck: `pnpm check`.
- All user-facing strings go through `lib/translations.ts` (EN + UK keys).
- **The bridge protocol is `lib/bridge-protocol.ts`**; the tool registry (from
  package E) is **`lib/ai/bridge-tools.ts`**. Both are shared app/bridge
  modules — nothing under `tools/ai-bridge/` may be imported by app code.
- Pure logic in `lib/`, store wiring in `stores/`, UI in `components/`,
  bridge in `tools/ai-bridge/src/`.
- Match existing code style (dense single-line style in `lib/ai/` and the
  bridge; follow the file you edit).
- Do not touch files outside your package's list without flagging it.
- Out of scope for the whole round (do not add): model conversation memory,
  variable mutation, character deletion, LAN/TLS, Gemini.

---

## Package E — Bridge foundation (target: Opus)

**Context.** `tools/ai-bridge/` is a local Node WS server (127.0.0.1:8787,
token auth, envelopes from `lib/bridge-protocol.ts`) hosting a chat provider
(`claude-provider.ts` — Agent SDK; `codex-provider.ts` — Codex CLI) and
proxying tools to the browser (`server.ts` `ToolInvoker`). Four structural
problems block round 2; you fix all four. No new features; everything stays
green.

**E1 — Tool registry (single source, TWO axes).** Tool definitions are
duplicated today, and `codex-response-schema.json` whitelists only FOUR of
the 8 registered tool names — a live bug (Codex can never call
`list_story_images`, `get_image_details`, `find_asset_usage`,
`propose_appearance_patch`). Create **`lib/ai/bridge-tools.ts`** (NOT inside
`tools/ai-bridge/` — the app must import it too, and Expo cannot import Node
modules; the bridge already imports `lib/bridge-protocol.ts` the same way):
```ts
export interface BridgeToolDef {
  name: string; description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  exposure: 'model' | 'internal';  // may the MODEL call it?
  site: 'app' | 'bridge';          // where it executes
  requiresCapability?: string;     // consumed by preflight (packages L/I)
  timeoutMs?: number;              // propose_* use 600_000 today
  binaryResult?: boolean;          // result may exceed the 1 MB tier (E4);
                                   // round 2: only get_image_binary (pkg J)
}
export const BRIDGE_TOOLS: BridgeToolDef[] = [ /* the existing 8, all
  exposure:'model', site:'app' */ ];
```
**Schema type is load-bearing:** the Claude Agent SDK's `tool()` is
`tool<Schema extends AnyZodRawShape>(name, desc, inputSchema, handler)` — it
takes a zod RAW SHAPE, not a `ZodSchema`
(`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:6745`; today's
`claude-provider.ts` passes inline shapes like `{ sceneId: z.string() }`).
Store a `ZodObject` in the registry and pass `def.inputSchema.shape` to the
SDK, the full object everywhere validation runs. A `schema: ZodSchema` field
would not compile against the SDK.
Round 2 will add: model+app (`propose_changeset`, `remove_background`),
model+bridge (`generate_image`, `edit_image`), **internal**+app
(`authorize_capability`, `get_image_binary` — the model must NEVER see these,
especially `get_image_binary`). Derive from the registry: (a) Claude MCP
tools, (b) Codex allowlist + prompt tool docs, (c) the Codex response JSON
schema `toolName` enum — the names enum is the ONLY registry-coupled part of
that file (`input` is `additionalProperties: true`; no per-tool argument
schemas exist or are needed); the JSON file stays CHECKED-IN; the parity test
COMPARES it against the registry and fails on drift (tests must never write
production files as a side effect; regenerate manually or via a small
prebuild script when the test fails), (d) app executor's handled-tool list. **Parity test:** Claude tools =
Codex allowlist = JSON schema enum = exactly the `exposure:'model'` entries;
`site:'app'` = app handler list; `site:'bridge'` = bridge handler list;
internal names appear on NO model surface; every entry has a nonempty
description.

**E2 — Structured tool errors end-to-end.** `server.ts resolveTool` (~139)
collapses failures into `new Error(errorMessage)` — the app's `errorCode`
(`PERMISSION_DENIED`, `STALE_REVISION`) never reaches the model. Fix with a
typed `BridgeToolError { errorCode, errorMessage, details }` carried through
the rejection; both providers format it into the model-visible tool result
(code first). Test: app returns `ok:false, errorCode:'PERMISSION_DENIED'` →
provider-visible result contains the code verbatim.

**E3 — Session lifecycle.** The server keeps a zombie session after socket
close (`server.ts:74-83` — only `session.socket = null`), so a fresh client
gets "Another session is already active". Breaks reload, reopen, token
change. Fix: (a) new client message `session_end` (additive in
`lib/bridge-protocol.ts`) disposing the session; (b) on `session_start`, an
existing session whose socket is NOT OPEN is disposed and replaced
IMMEDIATELY — do not gate this on a TTL: `session_end` on page unload is not
guaranteed and `sessionId` lives in client memory, so a TTL-only rule locks
the user out for its full duration after every crash/reload; a dead socket
means there is no live client left to protect (takeover of an ACTIVE socket
stays refused); (c) `BridgeClient.close()` sends `session_end` first;
(d) the client persists its `sessionId` in `sessionStorage` (web) so a
same-tab reload presents `resumeSessionId` and prefers RESUME over
replacement — wrap every access in `try/catch` (`sessionStorage` throws in
some privacy modes, and `lib/bridge-client.ts` may be bundled on native even
though the AI chat is web-only; a failed read just means no resume), and
scope the key to the bridge URL (e.g. `vne-bridge-session:<url>`) so
switching bridges never resumes a foreign session. Tests: immediate reload after hard socket drop → accepted (no
lockout window); reload-with-persisted-id resumes the same session; fast
resume still works; active-socket takeover still refused.

**E4 — Two-tier payload policy.** `MAX_MESSAGE_BYTES = 1_000_000`; a 1024px
PNG in base64 is 1.4–2 MB. In `lib/bridge-protocol.ts` add
`MAX_IMAGE_MESSAGE_BYTES = 8_000_000`,
`MAX_DECODED_IMAGE_BYTES = 5_500_000` (8 MB minus ~33% base64 overhead), and
`maxBytesForEnvelope(type, payload)`. Two tiers, explicitly: the ws server's
`maxPayload` rises to 8 MB (transport ceiling), but the per-message check
re-imposes 1 MB on every envelope EXCEPT server type `image_result` and
`tool_result` whose payload has `binaryTool: true`. The client flag is a
transport HINT only — server-side, the authoritative check is the pending
invocation: a big `tool_result` is accepted only when the requestId matches
a pending tool call whose registry entry has `binaryResult: true` (never
trust the browser's flag alone; test: oversized `tool_result` with
`binaryTool: true` but a non-binary pending tool → closed). Mirror the
size check in `lib/bridge-client.ts`. Add `image_result` to `ServerMessageType`,
`image_result_ack` to `ClientMessageType`, AND an optional
`binaryTool?: boolean` on the `tool_result` payload type now (payloads documented as types;
emission/ack behavior comes in packages I/J). Tests: oversized
normal message closes; 5 MB `image_result` passes; 9 MB anything closes;
1.5 MB non-image message closes despite the 8 MB transport ceiling.

**Read before writing:** `lib/bridge-protocol.ts`, `lib/bridge-client.ts`,
`tools/ai-bridge/src/server.ts`, `provider.ts`, `claude-provider.ts`,
`codex-provider.ts`, `codex-response-schema.json`, bridge tests.

---

## Package F — AiChangeSet pure core (target: Opus)

**Context.** Expo/RN-Web visual-novel editor, Zustand store, IndexedDB. The
only AI mutation object today is `AiScenePatch` (`lib/ai/scene-patch.ts`,
types in `lib/ai/scene-patch-types.ts`): 5 ops on ONE existing scene, guarded
by a mandatory `expectedRevision` (FNV-1a `hashStable`,
`lib/ai/scene-revision.ts`). You build `AiChangeSet`: several changes applied
with one confirmation — including CREATING scenes — so the model can build
plot branches.

**CRITICAL domain facts.**
- The reader navigates a choice via `option.targetSceneId` INSIDE the choice
  block's data (`lib/engine/useSceneExecutor.ts:651`); the scene connection
  (`outputPort === optionId`) is a derived fallback. The canonical flow
  updates BOTH (`lib/document-editor/branch-actions.ts:36`, mirroring
  `documentSceneToConnections`). Read both files first.
- Step-id lookups search ACROSS scenes (`findChoiceStepScene(scenes, id)`) —
  new step ids must be unique across the WHOLE story, not just per timeline.
- New scenes must reuse the canonical defaults: see
  `createNextSceneRecordAfter` (`lib/document-editor/next-scene.ts:34`) —
  `createEmptySceneState()` from `lib/engine/conditionUtils`,
  `generateId('scene')`, flow coordinates, `isStart:false`, timestamps. Do
  not invent different defaults; factor/reuse.

**Deliverable.** `lib/ai/change-set.ts` (pure, zero Zustand/React) +
`__tests__/unit/lib/ai-change-set.test.ts`.

**Types.**
```ts
/** NARROW AI-facing character shapes. Never expose full `Character`: it
 * embeds sprites[].uri/assetUri (model must never see or set URIs) and
 * id/createdAt (core-generated). Sprites are off-limits to AI in round 2. */
export interface AiCharacterCreate { tempId: string;   // "newchar:<slug>"
  name: string; color?: string }
export interface AiCharacterUpdate { characterId: string;
  updates: { name?: string; color?: string } }

export type AiChangeSetItem =
  | { kind: 'create_character'; character: AiCharacterCreate }
  | { kind: 'update_character'; update: AiCharacterUpdate }
  | { kind: 'create_scene'; tempId: string;            // "new:<slug>", unique
      afterRef: string;      // anchor: real sceneId or earlier tempId — flow
                             // coords and sceneOrder insertion derive from it
      name: string; description?: string; timeline: TimelineStep[] }
  | { kind: 'patch_scene'; sceneRef: string;            // real id or tempId
      operations: ScenePatchOperation[] }                // reuse existing op types
  | { kind: 'set_choice_target'; sceneRef: string;
      choiceStepId: string; optionId: string; targetRef: string | null }
  | { kind: 'set_connection'; sceneRef: string;
      outputPort: string; targetRef: string | null };

export interface AiChangeSet {
  storyId: string;
  /** Revision of EVERY pre-existing scene any item touches (patch, choice
   * target, connection). Temp scenes are absent by definition. */
  expectedSceneRevisions: Record<string, string>;
  /** Required iff character items are present. */
  expectedCharacterRevision?: string;
  items: AiChangeSetItem[];
  explanation: string;
}
```
Note `patch_scene` deliberately embeds `{sceneRef, operations}` rather than a
full `AiScenePatch` — `AiScenePatch.expectedRevision` is mandatory in its zod
schema and has no meaning for temp scenes; revisions live once at the
changeset level instead. Reuse `ScenePatchOperation` and the pure op
helpers/validators from `scene-patch.ts` internally.

Plus: `aiChangeSetSchema` (zod), `validateAiChangeSet`, `applyAiChangeSet`,
`describeAiChangeSet`, `computeCharacterLibraryRevision` (via `hashStable`).

**Semantics (all must hold).**
1. **Topological item order enforced by validation:** character items →
   `create_scene` → `patch_scene` → `set_choice_target` / `set_connection`.
   (Characters first so a new scene can reference a new character.) Violation
   → error code `ITEM_ORDER`.
2. **Up-front concurrency check:** before applying item 1, verify every entry
   of `expectedSceneRevisions` against the input scenes and
   `expectedCharacterRevision` against the library; also verify the map
   COVERS every pre-existing scene the items touch (missing entry →
   `MISSING_REVISION`). Stale → `STALE_REVISION` with scene id. Validation is
   all-or-nothing.
3. **Deep temp-id resolution:** map scene tempIds AND character tempIds →
   generated real ids (injectable `generateId` for determinism). Resolve
   `sceneRef`/`targetRef`/`afterRef`, every `targetSceneId` inside timeline
   steps of `create_scene`/`patch_scene` items, AND every character-id
   reference in timeline steps that points at a `newchar:` tempId (walk
   choice options / dialogue character fields; a generic deep walk on the
   literal property names is acceptable — document it). Unknown ref → error.
   If a generated id collides with an existing scene/character id →
   `ID_COLLISION` (retry internally once, then fail).
3b. **Anchored creation + order + flow:** `createNextSceneRecordAfter`
   (`next-scene.ts:34`) requires a source scene — resolve `afterRef` to it
   for flow coordinates and defaults; ordered insertion mirrors
   `insertSceneAfter` (`next-scene.ts:5`). The input context therefore
   includes `sceneOrder: string[]` plus the referential-validation fields —
   extend the EXISTING `PatchProjectContext` (`scene-patch.ts:5`:
   `{ sceneIds, characterIds, variableNames, assetIds }`) rather than
   inventing a parallel context type — and the apply result includes
   `nextSceneOrder: string[]`.
   Multiple scenes anchored to the same `afterRef` get deterministic,
   NON-OVERLAPPING flow coordinates (stagger `flowY` per sibling) and insert
   in item order.
4. **`set_choice_target` writes BOTH sides:** `option.targetSceneId` in the
   step data AND the derived connection (`outputPort = optionId`), like
   `branch-actions.ts`. `set_connection` covers non-choice ports.
5. **Sequential validation against a working copy**
   (`{ scenes: Map<string, SceneRecord>, characters: Character[] }`,
   plain-object constructible). `patch_scene` may edit a scene created
   earlier in the set. New step ids checked unique story-wide (fact above).
6. **Character deltas:** the core generates real `id` + `createdAt` for
   `AiCharacterCreate` (empty `sprites: []`); duplicate tempId, name
   duplicating an existing character, or unknown `update_character`
   `characterId` → error. Updates touch ONLY `name`/`color` — sprites/URIs
   are unreachable by construction. No delete.
7. **`applyAiChangeSet` returns a plain result** (no writes):
   ```ts
   { scenesToSave: SceneRecord[]; sceneIdsCreated: string[];
     nextSceneOrder: string[];   // sceneOrder with created scenes inserted
     /** FULL final library, not a delta — the store writes libraries whole. */
     charactersToSave?: Character[];
     connectionsToSet: Array<{ sceneId: string; outputPort: string;
                               targetSceneId: string | null }> }
   ```
   `connectionsToSet` lists EVERY changed connection, new and existing scenes
   alike.
8. Limits: non-empty, ≤20 items, unique tempIds; stable error codes.
9. **`describeAiChangeSet`:** per-scene sections (created — name, step count,
   first-dialogue teaser — vs modified, reusing `ScenePatchDescription`
   kinds), characters section, choice/connection changes ("Scene A → Scene B
   via choice 'Run away'"), `warnings: string[]`.

**Tests (minimum).** Choice-branch E2E at data level (create two scenes
anchored after an existing scene + `set_choice_target` into both → resulting
records have `option.targetSceneId`, matching `connectionsToSet`,
`nextSceneOrder` has both inserted after the anchor, and the two siblings
have different `flowY`); character-then-scene ordering works (new scene's
dialogue references a `newchar:` tempId and resolves), reverse order
rejected; patch-after-create; temp-id inside an inserted choice option
resolves; unknown `afterRef`; missing revision entry; stale scene / stale
character revision reject all; story-wide duplicate step id rejected;
ID_COLLISION path; character create carries generated id/createdAt and empty
sprites; deterministic generator; describe fixture; new-scene defaults match
`createNextSceneRecordAfter`'s shape.

**Read before writing:** `lib/ai/scene-patch.ts`, `scene-patch-types.ts`,
`scene-revision.ts`, `story-context.ts`, `lib/character-types.ts`,
`lib/document-editor/branch-actions.ts`, `next-scene.ts`,
`lib/engine/useSceneExecutor.ts` (~640), `__tests__/unit/lib/ai-scene-patch.test.ts`.

---

## Package G — Store adapter: atomic commit, LIFO undo journal, restore fix (target: Sonnet)

**Context.** Package F returns plain records. You wire them to the store,
make the commit atomic, fix TWO pre-existing snapshot bugs, and replace the
single undo slot with a safe journal.

**Verified facts you build on.**
- `restoreStorySnapshot` (`stores/app-store-slices/snapshots-slice.ts:61-85`)
  REPLACES the story's scene map (created scenes vanish on restore — do NOT
  add deleteScene calls) but writes back only `sceneCount`/`updatedAt`;
  captured `{title, startSceneId, sceneOrder, tags}` are dropped.
- `MAX_SNAPSHOTS_PER_STORY = 10` and **automatic snapshots evict first**
  (`lib/story-snapshots.ts:19,29`). `restoreStorySnapshot` creates its
  "Before restore" snapshot BEFORE reading the target — with a full index it
  can evict the very snapshot being restored.
- `saveSceneRecord` runs `syncCanonicalStartScene` (`scene-slice.ts:152`);
  your atomic commit must preserve that behavior (a created scene with
  `isStart: true` must move `startSceneId`).
- Character libraries/themes are outside snapshots — capture previous values
  (`lib/ai/appearance-patch-adapter.ts` is the pattern; the scene-patch
  equivalent is `lib/ai/scene-patch-adapter.ts` — note the exact name).
- `stores/ai-chat-store.ts` has a single `lastAppliedChange` slot — a second
  apply silently discards the first rollback.

**Deliverables.**
1. **G1 — restore fix** in `snapshots-slice.ts` (+ `lib/story-snapshots.ts`
   if its return shape needs the manifest metadata): (a) read the ENTIRE
   target snapshot BEFORE creating the "Before restore" snapshot (eviction
   hazard above); (b) restore `title`, `startSceneId`, `sceneOrder`, `tags`
   from the manifest when present (legacy snapshots without metadata keep
   current behavior); (c) validate the restored `startSceneId` exists in the
   restored scene map — fallback to the first entry of the restored
   `sceneOrder` (then any scene), never a dangling id. Tests: metadata
   round-trip; legacy snapshot; dangling startSceneId fallback; **cap-full
   case — restoring the oldest automatic snapshot with a full index
   succeeds**.
2. **G2 — atomic commit action** `commitAiChangeSet(result)` in a store
   slice: ONE Zustand `set` writes all scene records, story metadata
   (`sceneCount`, `updatedAt`, AND `sceneOrder` from the result's
   `nextSceneOrder`), and the character library together — no
   `saveSceneRecord` loop + separate `setCharacterLibrary` (a crash between
   writes must be impossible). Factor the internals `saveSceneRecord` uses
   (read `scene-slice.ts`) rather than forking persistence logic, and make
   sure `syncCanonicalStartScene` still runs for created scenes with
   `isStart`.
3. **G3 — adapter** `lib/ai/change-set-adapter.ts`:
   `applyAiChangeSetToStore(changeSet)`: re-validate against LIVE store state
   FIRST — on failure return `{ ok:false, code, message }` with zero side
   effects and NO snapshot (an empty pre-snapshot for a failed apply is
   pollution); then `createStorySnapshot(storyId, 'AI: changeset <time>',
   true)` — the third argument (`automatic`) DEFAULTS TO FALSE and the
   existing scene adapter passes `true` (`scene-patch-adapter.ts:31`); an
   unmarked AI snapshot would crowd out the user's manual snapshots at the
   cap-10 eviction (automatic evict first); capture
   `previousCharacterLibrary` iff characters change; `commitAiChangeSet`;
   return `{ ok:true, undo, description }`. `rollbackAiChangeSet(undo)`:
   `restoreStorySnapshot` (now metadata-correct) →
   `setCharacterLibrary(previous)` if captured.
4. **G4 — LIFO undo journal** in `stores/ai-chat-store.ts`: replace
   `lastAppliedChange` with `appliedChanges: AppliedChange[]` (stack, cap 10):
   `{ kind: 'scene'|'appearance'|'changeset'; ...payloads; appliedAt;
   label; postRevisions: { scenes: Record<sceneId, revision>;
   characters?: string;
   /** hash of {title, startSceneId, sceneOrder, tags} — after G1 a snapshot
    * restore rewrites these too, so a manual rename/reorder since apply must
    * also trigger the guard */
   storyMetadata: string;
   /** theme (+ future layout preset) — appearance rollback overwrites it */
   appearance?: string } }`. Rules: **rollback is strictly LIFO** (only the
   top entry; no reaching under newer entries); before rolling back, compare
   EVERY captured `postRevisions` field to CURRENT values — if any differs
   (manual edits since apply: scene content, character, title, scene order,
   tags, theme), refuse the silent path and require an explicit
   "discard newer edits" confirmation flag; when a snapshot referenced by an
   entry is evicted from snapshot storage, drop that entry (expose a sync
   hook the snapshot module calls, or reconcile lazily on read). Migrate the
   two existing writers (scene patch via `scene-patch-adapter.ts`,
   appearance) and their rollback paths. Pendings stay mutually exclusive;
   add `pendingChangeSet`.

**Tests.** Apply → new scenes + modified scene + new character present;
rollback → created scenes gone, modified scene back,
`sceneOrder`/`startSceneId` back, library verbatim; stale live revision →
store deep-equal untouched AND no snapshot created; LIFO enforced (rolling
back under a newer entry is rejected); manual-edit guard fires for EACH
dimension separately (mutate a scene / rename the story / reorder scenes /
change the theme after apply → rollback demands confirmation); journal cap
eviction; evicted snapshot drops its entry; commit applies `nextSceneOrder`;
the changeset pre-snapshot is created with `automatic === true`;
G1 cases above.

**Read before writing:** `lib/ai/appearance-patch-adapter.ts`,
`lib/ai/scene-patch-adapter.ts`, `stores/ai-chat-store.ts`,
`stores/app-store-slices/scene-slice.ts`, `snapshots-slice.ts`,
`lib/story-snapshots.ts`.

---

## Package H — ChangeSet diff UI + end-to-end wiring (target: Sonnet; needs E, F AND G merged)

**Context.** Confirm cards live in `components/ai-chat/`
(`PatchPreviewCard.tsx`, `AppearancePreviewCard.tsx`). You build the
changeset card and close the model→app loop. You call package G's adapter and
journal — G must be merged before you start (do not stub it).

**Deliverables.**
1. `components/ai-chat/ChangeSetPreviewCard.tsx` fed by `describeAiChangeSet`:
   collapsible per-scene sections (`NEW` badge for created — name, step
   count, first-dialogue teaser; added/removed/changed rows for modified,
   reusing `PatchPreviewCard`'s row approach); choice/connection section
   ("Scene A → Scene B via choice 'Run away'"); characters section; warnings
   block (appearance-card style); footer summary ("2 scenes created,
   1 modified, 3 links") + Apply / Reject; applied state shows the LIFO
   journal rollback affordance (top entry only).
2. **`propose_changeset` registry entry** in `lib/ai/bridge-tools.ts`:
   `{ name:'propose_changeset', inputSchema: aiChangeSetSchema,
   exposure:'model', site:'app', timeoutMs: 600_000 }` (the field is
   `inputSchema` — E1's shape; there is no `schema` field). The registry
   propagates it to Claude and the Codex allowlist automatically; the Codex
   JSON schema is CHECKED-IN, so you also add `"propose_changeset"` to its
   `toolName` enum by hand — that enum is the only per-tool part (`input` is
   `additionalProperties: true`, no argument schemas needed). Parity test
   stays green.
3. `AiChatPanel.tsx` executor: handle `propose_changeset` (validate via F,
   set `pendingChangeSet`, resolve the tool with the described summary or a
   structured error — mirror the `propose_scene_patch` decision flow);
   Apply/Reject via G's adapter; rollback via the journal.
4. `tools/ai-bridge/src/system-prompt.md` Changesets section: when to use a
   changeset vs a single scene patch; tempId convention; item order
   (characters → create → patch → connect); `expectedSceneRevisions` must
   cover every existing scene touched; choice targets via `set_choice_target`
   only; ≤20 items.
5. Translations `aiChat.changeSet.*`, EN + natural UK.

**Tests.** Card renders created+modified+choice sections from a fixture;
Apply/Reject fire; executor round-trip (tool call → pending → apply → journal
entry, adapter mocked); invalid changeset resolves with the structured error
code; EN↔UK key parity; registry parity test green.

**Read before writing:** `PatchPreviewCard.tsx`, `AppearancePreviewCard.tsx`,
`AiChatPanel.tsx`, `stores/ai-chat-store.ts`, `lib/ai/bridge-tools.ts`,
`system-prompt.md`, `__tests__/unit/components/AiChatPanel.test.tsx`.

---

## Package M — Connection onboarding (target: Sonnet; needs E)

**Context.** `AiChatPanel.tsx:65` reads `process.env.EXPO_PUBLIC_AI_BRIDGE_TOKEN`
at BUILD time; no token → silent fallback to the scripted fake agent. Two
facts shrink this package: `BridgeClient` already accepts `url`+`token` and
has reconnect + heartbeat (`lib/bridge-client.ts:15-42`) — do not
reimplement. Package E fixed the server session lifecycle (you depend on it).
One fact enlarges it: **the client currently reports `connected` on
`socket.onopen` (`bridge-client.ts:76`), BEFORE token auth** — a wrong token
still shows "connected" until the server errors.

**Deliverables.**
1. Store: `aiBridgeSettings { url; token }` — **there is NO "settings
   slice"**; do NOT put this inside `UserSettings`: `normalizeUserSettings`
   (`lib/user-settings.ts:48`) REBUILDS the object from known fields, so an
   unknown field silently vanishes on the next `updateSettings`, and the
   token is a local secret that doesn't belong in reader preferences. Add it
   as its OWN top-level persisted field: state + default, an action (put it
   in `stores/app-store-slices/preferences-slice.ts` alongside
   `updateSettings`), and include the field in `buildPersistedAppState` +
   the merge path (`lib/app-store-persistence.ts:153` — follow how
   `settings`/`language` travel). Panel resolves store → env fallback. The client is created in
   a `useEffect` whose deps do NOT currently include url/token — add them so
   a settings change tears down (`close()` → `session_end`, from E3) and
   rebuilds the client live. No page reload.
2. **Connection-state truthfulness** in `lib/bridge-client.ts`: report
   `connected` only after `session_started` arrives; between socket-open and
   that, stay `connecting`. On an `UNAUTHORIZED` error envelope: stop the
   reconnect loop (set a terminal `unauthorized` state) until the token
   changes or the user hits Retry — an infinite retry against a wrong token
   is noise.
3. `components/ai-chat/ConnectionCard.tsx` shown in-chat when not connected:
   (a) no token — 3-step guide ("1. Install Claude Code or Codex CLI ·
   2. Run `pnpm ai-bridge` in the project folder · 3. Paste the token it
   prints") + token input + Connect; (b) connecting — spinner; (c) failed —
   the actual reason (refused / bad token / origin) + Retry; (d) connected —
   collapses to a status row.
4. Header chip: `Fake demo` / `Connecting` / `Connected · Claude Code` /
   `· Codex` / `Error`. Add `provider: 'claude'|'codex'` to the
   `session_started` payload (additive; `server.ts` +
   `lib/bridge-protocol.ts` type).
5. Bridge `main.ts`: print a delimited pairing block at startup — token,
   port, "paste this token into the editor's AI panel". A generated random
   token (no config) prints the same way. Unit-test the formatter.
6. Translations `aiChat.connection.*` EN+UK.

**Tests.** Precedence (store beats env); rebuild on token change (mocked
client); `connected` only after session_started; UNAUTHORIZED halts retries;
ConnectionCard 4 states; chip states incl. provider; pairing formatter.

**Read before:** `lib/bridge-client.ts` (esp. `openSocket`/`handleMessage`),
`AiChatPanel.tsx:55-140`, `tools/ai-bridge/src/main.ts`, `server.ts`,
`stores/app-store-slices/preferences-slice.ts`,
`lib/app-store-persistence.ts`.

---

## Package N — Chat polish (target: ChatGPT or Sonnet)

Three independent tasks; do all three.

**N1 — Reply in the user's language.**
`tools/ai-bridge/src/system-prompt.md`: Language section — "Always reply in
the language of the user's LAST message; user messages decide, not the UI."
Also pass the app locale for terminology — and this needs real plumbing,
not hand-waving: add an optional `context: { locale?: string }` to the
`session_start` payload (additive, `lib/bridge-protocol.ts`; the client
sends the app language), and extend `AgentProviderFactory`
(`tools/ai-bridge/src/provider.ts:15` — today it takes ONLY a
`ToolInvoker`) to `(tools, session?: { locale?: string })`; both providers
append a one-line locale hint to their system prompt. Test: session_start
with `locale:'uk'` → provider factory receives it.

**N2 — Persistent per-story transcript (UI-only).**
`stores/ai-chat-store.ts` messages are in-memory. Persist as
`messagesByStory: Record<storyId, Message[]>` — mirror
`stores/theme-store.ts` exactly: zustand `persist(..., { name:
'vne-ai-chat', storage: createJSONStorage(createPersistentStorage) })` with
`createPersistentStorage` from `lib/persistent-storage.ts` (do NOT touch the
main app-store persist). Caps: FIFO
200 messages per story AND a per-story byte cap (~512 KB serialized — prune
oldest until under). Pendings are NOT persisted (live revisions — drop on
reload). Never persist image base64 (cards persist assetId or a discarded
marker). "Clear chat" in the panel menu. **Honesty:** the Claude provider
runs a fresh `query()` per turn — the model does NOT remember earlier turns;
show a subtle note on restored transcripts ("The assistant doesn't remember
previous conversations"). Transcripts of DELETED stories must not accumulate
forever — prune entries whose storyId no longer exists in the app store,
but ONLY after the app store has actually hydrated: at startup
`storiesMetadata` is `[]` and fills asynchronously, so pruning "on load"
would delete EVERYTHING. Gate the prune on hydration completion (the app
store sets `isLoaded: true` after `migrateFromLegacyKeys`; subscribe to
that, or use `useAppStore.persist.onFinishHydration` + the migration), and
also prune the entry inside the `deleteStory` flow. Tests: reload
round-trip; story A↔B switch keeps transcripts isolated; message cap; byte
cap; pendings dropped; no base64 persisted; deleted-story transcript
pruned; **delayed-hydration test: prune fires only after `isLoaded`, and an
empty pre-hydration store does NOT wipe transcripts**.

**N3 — Markdown rendering (write your own small renderer).**
Assistant messages render bold/italic/inline-code/code fences/lists/links.
**`lib/rich-text.ts` is NOT a markdown renderer** — it parses only the
story's own inline markup (`**bold**`, `*italic*`, `[color=…]`) into
`RichTextSpan[]`; its `[...]` syntax means color/size, not links, and it has
no code/lists/headers. Do not try to extend it into markdown and do not add a
dependency (and never Plate). Write a ~50–80-line renderer for that subset
targeting React Native Web `<Text>`/`<View>` (you may borrow rich-text's
span-parsing approach). **Links: allowlist `https`/`http`/`mailto` schemes
only** — never open arbitrary model-generated URIs (`javascript:` etc.).
User messages stay plain. Malformed input degrades to plain text, never
crashes. Tests: each construct; scheme filtering; degradation.

---

## Package L — Access levels + capability preflight (target: Sonnet; needs E + G + H merged)

**Context.** You add per-capability permission levels enforced app-side, AND
you own the `authorize_capability` internal tool END-TO-END: registry entry,
decision logic, and the executor implementation with its confirm UI. (Package
J consumes it for images; package I calls it from the bridge.) Package E
guarantees structured errors reach the model. You need G (auto-applies push
undo-journal entries) and H (you rewire the same executor decision paths)
already merged.

**Model.** `lib/ai/permissions.ts`:
```ts
type AiCapability = 'scene_edit' | 'appearance' | 'changeset' | 'image_generate';
type AiPermissionLevel = 'confirm' | 'auto' | 'blocked';
```
- Defaults all `confirm`; `changeset` never `auto` (setter clamps, UI doesn't
  offer). Deliberately NO `image_import` capability (import is
  user-button-only) and NO `read` entry (read tools always allowed) —
  document both in the module header. `image_generate` also gates
  `remove_background` (package J): no API spend, but a heavy model-triggered
  operation belongs under the same switch.
- Persisted globally (not per-story). **There is NO "settings slice"** — the
  home is `UserSettings` in `lib/user-settings.ts` via `updateSettings`
  (`stores/app-store-slices/preferences-slice.ts`), and the trap is that
  `normalizeUserSettings` REBUILDS from known fields: you MUST extend the
  interface, `defaultUserSettings`, AND the normalizer (sanitize each level
  to the enum, clamp `changeset`), or the field silently vanishes on the
  next settings write. Persistence then comes via
  `buildPersistedAppState` (`lib/app-store-persistence.ts:160`) — but NOT
  for free: `migrateFromLegacyKeys` (`stores/use-app-store.ts:189`) runs
  after hydration and sets `settings: normalizeUserSettings(settings ??
  current.settings)` — a surviving LEGACY settings record (which predates
  `aiPermissions`) would wipe hydrated levels back to defaults on every
  launch. Preserve them in that merge (when the legacy record lacks
  `aiPermissions`, keep `current.settings.aiPermissions`). Test: hydrated
  `blocked` + legacy settings record present → after migration still
  `blocked`.
- Enforcement in the `AiChatPanel` executor: `blocked` → structured
  `PERMISSION_DENIED` (code from `lib/bridge-protocol.ts`), nothing changes;
  `auto` (scene_edit/appearance only) → apply immediately, still push an
  undo-journal entry (package G) and render the card in "applied" state;
  `confirm` → current behavior.
- **`authorize_capability` (yours entirely):** registry entry in
  `lib/ai/bridge-tools.ts` `{ exposure:'internal', site:'app',
  timeoutMs: 600_000 }` — the default tool timeout is 30 s
  (`TOOL_TIMEOUT_MS`, `server.ts:8`), far too short for a human decision on
  the confirm chip; invisible to models; executor handler: consult
  `resolveCapability(capability)`;
  `blocked` → `{ allowed:false }` + structured PERMISSION_DENIED; `auto` →
  `{ allowed:true }`; `confirm` → render an inline confirm chip showing the
  capability and the estimate (e.g. cost range for images), await the user,
  resolve accordingly (mirror the propose_* decision-ref flow).
- UI: gear in the AI panel header → 4 rows, segmented
  confirm/auto/blocked with the clamp. Strings `aiChat.permissions.*` EN+UK.

**Tests.** Blocked → PERMISSION_DENIED + store untouched; auto applies +
journal entry; changeset clamp; persistence round-trip;
`authorize_capability` all three levels incl. the confirm-chip flow (user
accepts / declines); parity test still green (internal tool absent from model
surfaces).

**Read before:** `AiChatPanel.tsx` executor + decision refs,
`stores/ai-chat-store.ts`, `lib/user-settings.ts`,
`stores/app-store-slices/preferences-slice.ts`, `lib/bridge-protocol.ts`,
`lib/ai/bridge-tools.ts`.

---

## Package J — App-side images: receiver, import, binary RPC, remove_background (target: Sonnet; needs E + L)

**Context.** Package I (later) will make the bridge emit `image_result`
envelopes; you build the browser half FIRST so the bridge has something to
call. Import must use the REAL media pipeline — and mind an easy trap:
**`addImageAssetToStory` exists twice.** The one in
`lib/story-image-library.ts:58` is a PURE function (returns a new map, writes
nothing). You must call `addAssetToLibrary`
(`stores/media-library-actions.ts:35`) and then the STORE ACTION
`addImageAssetToStory(storyId, assetId)` from
`stores/app-store-slices/libraries-slice.ts:32` (via the app store), which
applies that pure helper to state.

**Deliverables.**
1. `image_result` handling in `lib/bridge-client.ts` → `AiChatPanel.tsx`:
   immediately base64 → Blob + `URL.createObjectURL`; base64 is never
   retained in state or persisted history (persist assetId or a discarded
   marker; revoke Blob URLs on discard/unmount). This transport is web-only —
   fine, the AI chat is web-only. **Delivery ack + dedup:** after
   successfully processing an `image_result`, the client sends
   `image_result_ack { requestId }` (new client message type, additive in
   `lib/bridge-protocol.ts`); the bridge may REDELIVER unacked results after
   a reconnect, so the client dedupes by `requestId` — a redelivered result
   must render exactly ONE card (test this).
2. `components/ai-chat/ImageResultCard.tsx`: thumbnail (blob URL), prompt,
   purpose, size, estimated cost if present; **Add to story images** /
   **Discard**. Import = decode → `addAssetToLibrary` → store-action
   `addImageAssetToStory`; card then shows the assetId. Nothing imports
   without the press. Imported images are global assets — changeset rollback
   never deletes them.
3. App-side tools (names/schemas registered in `lib/ai/bridge-tools.ts`,
   `exposure:'internal'` for the first, `exposure:'model'` for
   remove_background):
   - `get_image_binary { assetId }` → `{ mimeType, base64 }` in a
     `tool_result` flagged `binaryTool: true` (its registry entry sets
     `binaryResult: true` — the server accepts the oversized result only
     against that entry, see E4); enforce
     `MAX_DECODED_IMAGE_BYTES` (5.5 MB, from E4) — LARGER assets are
     downscaled client-side (canvas) to fit, or rejected with a structured
     error naming the limit; only assets of the ACTIVE story.
   - `remove_background { assetId }` → gated by the `image_generate`
     capability with the FULL three-level contract (consult package L's
     `resolveCapability` first — heavy model-triggered operation, same
     switch as generation even without API spend): `blocked` → structured
     `ok:false` + `PERMISSION_DENIED` (the `{allowed:false}` shape belongs
     ONLY to `authorize_capability`'s bridge preflight — never mix the two);
     `confirm` → reuse L's inline confirm-chip decision flow and do NOT
     start ISNet until the user accepts (decline → the same structured
     denial); `auto` → proceed. Its registry entry therefore carries
     `timeoutMs: 600_000` — without it the default 30 s bridge timeout
     kills the tool while the user is still deciding. Then resolve the
     asset URI from the store, run existing
     `removeImageBackground` (`lib/remove-background.web.ts`, URI-based,
     runtime CDN import — reuse its loader), result data-URI → the same
     `ImageResultCard` flow with purpose `'background-removed'`; import only
     on confirm.
4. Translations `aiChat.images.*` EN+UK.

**Tests.** Card renders from fixture; import calls `addAssetToLibrary` AND
the store action (assert store state changed — this is the regression the
pure-function trap causes); discard leaves libraries untouched + revokes URL;
`get_image_binary` rejects foreign-story assets; oversized asset downscaled
or structured error; `remove_background` chain (ISNet mocked) at ALL three levels — blocked →
PERMISSION_DENIED without running ISNet; confirm-accept runs ISNet only
AFTER the decision; confirm-decline → structured denial, ISNet never called;
auto proceeds; redelivered
`image_result` with the same requestId renders one card and re-sends the
ack; no base64 in persisted chat state.

**Read before writing:** `stores/media-library-actions.ts`,
`stores/app-store-slices/libraries-slice.ts`, `lib/story-image-library.ts`
(note it's pure), `lib/remove-background.web.ts` (+ native twin),
`lib/bridge-client.ts`, `AiChatPanel.tsx` executor, `lib/ai/asset-tools.ts`
(URIs withheld from the MODEL — keep that invariant; `get_image_binary` is
`exposure:'internal'`, its output goes to the bridge tool only).

---

## Package I — Bridge-side image generation (target: Opus; needs E + L + J)

**Context.** Packages E (registry, payload policy, structured errors), L
(`authorize_capability`), and J (`get_image_binary`, image receiver) are
merged — both app RPCs you depend on actually exist. You add the first
BRIDGE-side tools via the OpenAI Images API. Keys live ONLY in the bridge
`.env`; any chat provider can call these tools.

**Deliverables.**
1. **`tools/ai-bridge/src/tool-runtime.ts` (BridgeToolRuntime).** Extend
   dispatch by registry `site`: `'app'` → existing WS-RPC; `'bridge'` → local
   handler map. Expose `emitToApp(type, payload)` for `image_result`
   envelopes. **Delivery ack/buffer (a `send()` that returned is NOT proof
   the browser processed anything):** every emitted `image_result` stays in
   a buffer keyed by `requestId` until the app confirms with
   `image_result_ack { requestId }` (package J sends it; the message type is
   additive in `lib/bridge-protocol.ts` — add it here if J hasn't landed the
   type yet). On session resume, re-emit all unacked results (the client
   dedupes by requestId). Buffer discipline: TTL ~10 min AND a hard cap
   (e.g. 5 entries / ~30 MB decoded-equivalent) — evict oldest with a
   logged warning; OpenAI has already charged for these, so eviction is a
   last resort, not the normal path. Wire into `server.ts` with minimal
   surgery.
2. **`tools/ai-bridge/src/image-tools.ts`.**
   ```ts
   generate_image { prompt; size?: '1024x1024'|'1536x1024'|'1024x1536';
                    quality?: 'low'|'medium'|'high'; outputFormat?: 'webp'|'jpeg'|'png';
                    purpose: 'background'|'character'|'item'|'other' }
   edit_image     { assetId; prompt; size?; quality?; outputFormat? }  // same params
   ```
   - Model: `process.env.OPENAI_IMAGE_MODEL` — CHECK OpenAI's current docs at
     implementation time; default to the current GPT Image model
     (`gpt-image-2` as of plan writing). Plain `fetch`, no SDK.
   - Default `outputFormat: 'webp'` (or jpeg) with compression — NOT png;
     png at 1024px rarely fits the 5.5 MB decoded cap.
   - Cost depends on quality/size/inputs → compute `estimatedCostUsd` as a
     RANGE (or with explicit quality pinned); never present a fake exact
     number.
   - Missing `OPENAI_API_KEY` → structured `IMAGE_PROVIDER_NOT_CONFIGURED` +
     one-line fix hint; never crash or block startup.
   - **Preflight before spend:** call app-side `authorize_capability
     { capability:'image_generate', estimate:{ costUsdRange, model, size,
     quality } }` (registry-driven via `requiresCapability`). Denied →
     return its structured PERMISSION_DENIED to the model verbatim; the
     OpenAI request must NOT have been sent (assert via fetch-mock call
     order).
   - Result → `image_result { requestId, purpose, prompt, mimeType, base64,
     estimatedCostUsd }` under E4's big-limit envelope; enforce
     `MAX_DECODED_IMAGE_BYTES` — an oversized API response is retried once at
     lower quality, then rejected with a structured error. The MODEL gets
     only `{ delivered:true, sizeBytes, purpose }` — never base64.
   - `edit_image`: source via app-side `get_image_binary` (J enforces the
     5.5 MB cap and downscaling on its side; still validate here).
   - Limits: ≤3 image calls per turn; 90 s per call. Logging: requestId,
     model, size, duration — NOT the full prompt by default (prompts are
     user content; full text only behind an opt-in `AI_BRIDGE_DEBUG` flag);
     never the key — redact it everywhere (extend `safeError` in
     `server.ts`).
3. Register both tools in `lib/ai/bridge-tools.ts`
   (`exposure:'model'`, `site:'bridge'`,
   `requiresCapability:'image_generate'`); parity test green.
4. `system-prompt.md` Images section: when to generate, purposes, the
   preflight reality, "import happens only via a user button — never claim an
   image was added to the story".
5. `.env.example`: `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`.

**Tests (mock fetch + mock app RPC).** Happy path emits `image_result`,
model sees metadata only; preflight denial → zero fetch calls + code
passthrough; missing key; API 400 passthrough (key-redacted); per-turn limit;
oversized → one lower-quality retry then structured error; **ack lifecycle:
disconnect after send but before `image_result_ack` → resume → the SAME
requestId is re-emitted → ack clears the buffer (assert empty)**; buffer TTL
and cap eviction; `edit_image` round-trip with mocked `get_image_binary`;
default logs contain no prompt text.

**Read before writing:** `tools/ai-bridge/src/server.ts`, `provider.ts`,
`lib/ai/bridge-tools.ts`, `lib/bridge-protocol.ts` (E4 helpers), `main.ts`,
bridge tests.

---

## Package K — Reader layout preset (target: Sonnet — design step first; needs E + G; runs LAST)

**Context.** `StoryReaderTheme` (`lib/story-theme.ts`) is colors-only.
Reader: `components/reader/ReaderDialoguePanel.tsx`, `ReaderChoices.tsx`,
`ReaderDisplay.tsx`, `components/story-reader-responsive.tsx`. Decision D6:
ONE closed enum. K does not touch `AiChatPanel`, but it DOES edit the tool
registry (`lib/ai/bridge-tools.ts`), `system-prompt.md`, and the appearance
adapter — the same files package I touches — so K is NOT parallel-safe with
I and stays last in the queue. Its Step-0 design pass, however, may happen
at any earlier time.

**Step 0 — design pass (short proposal BEFORE code):** read the four reader
components; define what `layoutPreset: 'classic' | 'compact' | 'top'` means
in each (dialogue panel placement/height, choices placement), how each adapts
mobile vs desktop (the responsive component already branches — reuse), and
flag anything over ~a day.

**Then deliver.**
1. `lib/story-theme.ts`: `StoryReaderLayoutPreset`,
   `DEFAULT_READER_LAYOUT_PRESET = 'classic'`, `sanitizeReaderLayoutPreset`.
   Story metadata gets optional `readerLayoutPreset` — mirror exactly how
   `theme` is stored/persisted/copied on import-export (search every place
   `theme` travels).
2. Reader honors the preset; absent field ⇒ `classic` ⇒ zero visual change.
3. `lib/ai/appearance-patch.ts`: optional `layoutPreset`; revision hash
   covers theme+preset; `describe` lists it; adapter captures
   `previousLayoutPreset` (snapshots cannot roll this back — same invariant
   as theme).
4. `AppearancePreviewCard` shows before→after row; `propose_appearance_patch`
   schema (registry) + `system-prompt.md` updated.

**Tests.** Sanitizer fuzz; preset-only patch apply→rollback; revision
changes; each preset renders (existing reader-test level); absent field =
identical rendering.

---

## Delegation split & sequencing

- **Opus:** E, F (parallel), later I.
- **Sonnet:** G, H, M, L, J, K (K strictly last; its design pass may run
  early).
- **ChatGPT:** N (+ optional second opinion on F's types).

**Order: E ∥ F → G → H → M → N → L → J → I → K.**
I is after J because both app RPCs it calls (`authorize_capability` from L,
`get_image_binary` from J) must exist first. L needs G+H merged (journal +
executor paths). K is last: it edits the registry, system prompt, and
appearance adapter that I also touches.
⚠️ H, M, N, L, J all touch `AiChatPanel.tsx` / `ai-chat-store.ts` /
`translations.ts` — hand out strictly one at a time.

Main session keeps: integration review per package, full-flow E2E (changeset
apply → reader navigates the new branch — reader-rendering test; generate →
import → use in scene; pairing → message → reply), first live Codex run.
