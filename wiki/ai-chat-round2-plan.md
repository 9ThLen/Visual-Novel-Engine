# AI Chat — Round 2 Plan (v4.3)

Status: revised 2026-07-15 (v4.3) after a fifth external review round
(v4.2 = fourth round, v4.1 = self-review); every accepted claim was
re-verified against the code. Round 1 (phases 0–3 + image
read tools + reader theme patch + Claude/Codex bridge providers) is shipped
and verified live in the browser.

## Round 2 scope (user-requested)

1. **AiChangeSet** — several changes applied with ONE confirmation and ONE
   rollback: create scenes, patch scenes, wire choice branches, edit characters.
2. **Image generation** — `generate_image` / `edit_image` (OpenAI Images API,
   bridge-side) + app-side `remove_background` (existing ISNet pipeline).
3. **Reader layout presets** — AI-selectable reader layout preset.
4. **Access levels** — per-capability tiers enforced app-side, with a
   preflight so bridge-side spend is stopped BEFORE it happens.
5. **Simple connection UX** — in-app pairing without editing `.env`.
6. **Chat polish** — user-language replies, persistent per-story transcript,
   markdown rendering, live Codex E2E.

**Explicitly NOT in round 2:** model conversation memory (Claude provider is
stateless per turn — transcript persistence is UI-only), variable mutation
(`Project.variables` exists, editing does not), character deletion, LAN/
mobile/TLS bridge mode, Gemini provider, auto-apply for changesets. The AI
chat itself (and the Blob-URL image transport) is **web-only**.

## Verified codebase facts (third pass, 2026-07-15)

Transport & bridge:
- Protocol lives in **`lib/bridge-protocol.ts`** (shared). No
  `tools/ai-bridge/src/protocol.ts` exists.
- **`BridgeErrorCode` is a CLOSED 7-member union** (`bridge-protocol.ts:21`)
  and `bridge-client.ts:11-13` types tool-result errors as exactly that
  union. New DOMAIN codes (F's `ITEM_ORDER`/`MISSING_REVISION`/
  `ID_COLLISION`, I's image-config error) must NOT be added to it — the
  wire code stays `VALIDATION_FAILED`/`STALE_REVISION`/
  `PROVIDER_UNAVAILABLE` and the domain code travels as `details.reason`
  (mapping pinned in packages F/H/I).
- **App-store persistence is asynchronous and multi-write** after any
  Zustand `set`: `app-store-storage.ts:93` `setItem` fans out to canonical
  scene payloads → indexes → app-state (`scene-record-storage.ts:317`
  intentionally commits payloads before the global index). One `set` is
  atomic IN MEMORY only — never crash-durable on disk (G2 wording fixed
  in v4.3).
- **Snapshot eviction prefers automatic victims but falls back to the
  oldest of ANY kind** (`selectEvictionVictim`, `story-snapshots.ts:187-191`)
  — with 10 manual snapshots, a new AI pre-snapshot evicts a manual one;
  behavior documented + pinned by test in G, not changed.
- `MAX_MESSAGE_BYTES = 1_000_000`; server hard-closes above it. Base64 adds
  ~33%, so an 8 MB envelope carries at most ~5.5–6 MB decoded.
- Codex drift is a LIVE bug: `codex-response-schema.json` whitelists 4 of the
  8 registered tools.
- Server keeps a zombie session after socket close (`server.ts:74-83`) —
  fresh clients are refused.
- `resolveTool` (`server.ts:139`) drops the app's `errorCode`.
- `lib/bridge-client.ts:76` reports `connected` on `socket.onopen`, BEFORE
  token auth / `session_started`. `UNAUTHORIZED` does not currently stop the
  reconnect loop.

Story model & store:
- Reader follows `option.targetSceneId` inside choice data
  (`useSceneExecutor.ts:651`); connections are fallback. Canonical branch flow
  updates BOTH (`branch-actions.ts:36`).
- Step-id lookups search ACROSS scenes (`findChoiceStepScene(scenes, stepId)`)
  — new step ids must be unique story-wide, not just per timeline.
- Canonical new-scene defaults: `createNextSceneRecordAfter`
  (`lib/document-editor/next-scene.ts:34`) + `createEmptySceneState()`
  (`lib/engine/conditionUtils`) + `generateId('scene')` — reuse, don't invent.
- `saveSceneRecord` runs `syncCanonicalStartScene` (`scene-slice.ts:152`) —
  any atomic commit must preserve that sync (a created scene with `isStart`
  moves `startSceneId`).
- Snapshot restore replaces the story's whole scene map but writes back only
  `sceneCount`/`updatedAt` — captured `{title, startSceneId, sceneOrder,
  tags}` are NOT restored (bug; fixed in G1).
- `MAX_SNAPSHOTS_PER_STORY = 10`, **automatic snapshots are evicted first**
  (`lib/story-snapshots.ts:19,29`), and `restoreStorySnapshot` creates its
  "Before restore" snapshot BEFORE reading the target
  (`snapshots-slice.ts:63`) — with a full index this can evict the very
  snapshot being restored.
- Media import is TWO steps: `addAssetToLibrary`
  (`stores/media-library-actions.ts:35`) then the STORE ACTION
  `addImageAssetToStory` (`stores/app-store-slices/libraries-slice.ts:32`).
  The same-named export in `lib/story-image-library.ts:58` is a pure helper —
  calling it alone writes nothing.
- Scene-patch adapter file is `lib/ai/scene-patch-adapter.ts` (NOT
  `patch-adapter.ts`).
- `Character` has `id`+`createdAt` (`lib/character-types.ts:28`) — update
  deltas must be `Partial<Omit<Character, 'id' | 'createdAt'>>`.
- `lib/rich-text.ts` parses ONLY story markup (`**bold**`, `*italic*`,
  `[color=…]`) into `RichTextSpan[]` — it is NOT a markdown renderer (no
  code/lists/links/headers) and returns spans, not React elements.
- Claude Agent SDK `tool()` takes `Schema extends AnyZodRawShape` — a zod RAW
  SHAPE, not a `ZodSchema` (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:6745`).
  The registry must store `inputSchema: ZodObject` and pass `.shape` to the SDK.
- `CharacterSprite` carries `uri` / `assetUri` (`lib/character-types.ts:8-14`)
  — a changeset contract exposing full `Character` would let the model read
  and write asset URIs, violating the round-1 invariant that URIs never reach
  the model.
- Default bridge tool timeout is 30 s (`TOOL_TIMEOUT_MS`, `server.ts:8`);
  only `propose_*` tools get 600 s — any tool that awaits a USER decision
  needs the long timeout explicitly.
- `createNextSceneRecordAfter(source, scenes)` REQUIRES a source scene (flow
  coordinates derive from it), and ordered insertion goes through
  `insertSceneAfter(sceneIds, sourceId, nextId)` (`next-scene.ts:5,34`) —
  scene creation without an anchor and without a `sceneOrder` update is not
  expressible in the canonical flow.
- There is NO "settings slice". Persisted user settings = `UserSettings`
  (`lib/user-settings.ts`) via `updateSettings`
  (`stores/app-store-slices/preferences-slice.ts`), persisted through
  `buildPersistedAppState` (`lib/app-store-persistence.ts:160`). Trap:
  `normalizeUserSettings` REBUILDS the object from known fields — an unknown
  field silently vanishes on the next write; every new field must be added
  to the interface, defaults, AND the normalizer.
- Standalone persisted stores follow `stores/theme-store.ts`: zustand
  `persist` + `createJSONStorage(createPersistentStorage)` from
  `lib/persistent-storage.ts` — the N2 transcript store mirrors this.
- `codex-response-schema.json` couples to tools ONLY via the `toolName` enum
  (`input` is `additionalProperties: true`) — parity is a names check; no
  per-tool argument schemas exist or are needed.
- `migrateFromLegacyKeys` (`stores/use-app-store.ts:189`) runs after
  hydration and lets a surviving LEGACY settings record override hydrated
  `settings` wholesale — any new `UserSettings` field must be preserved in
  that merge or it resets on every launch. Related: at startup
  `storiesMetadata` is `[]` until async hydration + migration set
  `isLoaded: true` — anything that prunes by story existence must wait for
  that.
- `createStorySnapshot(storyId, name, automatic?)` DEFAULTS `automatic` to
  `false`; the scene-patch adapter passes `true`
  (`scene-patch-adapter.ts:31`) — AI snapshots must too, or they crowd out
  manual snapshots at eviction.
- `AgentProviderFactory = (tools: ToolInvoker) => AgentProvider`
  (`tools/ai-bridge/src/provider.ts:15`) — session context (locale) has no
  path to providers today; N1 extends the factory signature.

## Architecture decisions

**D1. Image generation is a bridge-side tool, provider-independent.** OpenAI
Images API from the bridge, `OPENAI_API_KEY` in bridge `.env` only. Model id
via `OPENAI_IMAGE_MODEL` (default: the current GPT Image model per OpenAI
docs at implementation time — `gpt-image-2` as of this writing; don't
hard-code without checking). `generate_image` and `edit_image` accept the same
`size` / `quality` / `outputFormat` params; prefer WebP/JPEG output over
default PNG. Cost depends on quality/size/inputs → tools report
`estimatedCostUsd` (a range), never a fake exact number. **Delivery ack (designed, not hand-waved):** "sent" ≠ "processed".
The app confirms receipt with a new client message `image_result_ack
{ requestId }`; the bridge keeps every emitted `image_result` in a buffer
until acked (TTL ~10 min, bounded memory — a few entries), and re-emits
unacked results on session resume; the client dedupes by `requestId` so a
redelivery never renders a second card. Logging: request id, model, size —
never the full prompt by default (opt-in debug flag only), never the key.

**D2. ChangeSet rollback = snapshot restore (fixed) + captured non-scene
state + LIFO journal.** G1 fixes `restoreStorySnapshot`: restore metadata
(`title, startSceneId, sceneOrder, tags`) from the manifest, validate that the
restored `startSceneId` exists in the restored map (fallback: first of
`sceneOrder`), and **read the target snapshot fully BEFORE creating the
"Before restore" snapshot** (eviction hazard above). Character rollback =
captured `previousCharacterLibrary`. Undo entries live in a journal (stack,
cap 10) with these rules: **AI undo is strictly LIFO** (no rolling back entry
N-2 under newer entries); each entry stores post-apply revisions for
EVERYTHING its rollback would overwrite — scenes, characters,
`storyMetadataRevision` (hash of `{title, startSceneId, sceneOrder, tags}`:
after G1 a snapshot restore rewrites these too) and `appearanceRevision`
(theme + future layout preset) for appearance entries — and rollback REFUSES
(asks for explicit confirmation) when ANY current revision differs: a manual
rename, scene reorder, or theme tweak since apply must never be silently
destroyed;
when a snapshot referenced by an entry is evicted, the entry is dropped from
the journal (sync hook), so the UI never offers an impossible rollback.

**D3. Deep temp-id resolution, story-wide id safety, strict item order.**
Topological order enforced by validation: character items → `create_scene` →
`patch_scene` → `set_choice_target` / `set_connection` (so a new character
referenced by a new scene always exists first). Resolution covers refs AND
every `targetSceneId` embedded in timeline steps. `set_choice_target` writes
both the option data and the derived connection (branch-actions pattern).
Generated scene ids are checked for collisions (`ID_COLLISION`); new step ids
must be unique across the WHOLE story. **Created scenes are anchored:**
`create_scene` carries `afterRef` (real id or earlier tempId) because the
canonical creation path (`createNextSceneRecordAfter`) requires a source scene
for flow coordinates, and ordered insertion means updating `sceneOrder`
(`insertSceneAfter`). The pure core therefore takes `sceneOrder` (+
`assetIds`/`variableNames` for referential validation) in its input context
and returns `nextSceneOrder` in the apply result; sibling scenes created off
the same anchor get deterministic, non-overlapping flow coordinates
(staggered `flowY`).

**D3b. Concurrency: one revisions map for the whole set.** The changeset
carries `expectedSceneRevisions: Record<sceneId, revision>` covering EVERY
pre-existing scene any item touches (patch, choice target, connection —
they all mutate scenes), plus `expectedCharacterRevision` when character items
exist. All revisions are validated up front, before item 1 applies. The
`patch_scene` item embeds `{ sceneRef, operations }` (not a full
`AiScenePatch`, whose mandatory own `expectedRevision` would conflict for
temp scenes — temp refs have no revision by definition).

**D4. Pairing token moves to runtime settings.** `aiBridgeSettings { url,
token }` persisted as its OWN top-level app-store field (NOT inside
`UserSettings` — the normalizer would drop it, and a token is a local secret,
not a reader preference); store → env fallback; changing values rebuilds the
client (effect deps). "Connected" is shown only after `session_started` (socket-open
is not authenticated); `UNAUTHORIZED` halts the reconnect loop until the
token changes or manual retry. Depends on D8 lifecycle fix.

**D5. Permissions enforce app-side with a bridge preflight.** Capabilities:
`scene_edit | appearance | changeset | image_generate`, levels
`confirm | auto | blocked` (`changeset` never `auto`; `read` tools always
allowed, outside the table; no `image_import` capability — import is
user-button-only). Levels live in `UserSettings` (global) — which means
extending `normalizeUserSettings` too, or they vanish on the next write. Before any PAID bridge-side call the bridge invokes
app-side `authorize_capability { capability, estimate }`; its registry entry
carries `timeoutMs: 600_000` — the default tool timeout is 30 s, far too
short for a human decision. `remove_background` is also gated by the
`image_generate` capability (no API spend, but a heavy model-triggered
operation) with the full three-level contract — its registry entry needs
`timeoutMs: 600_000` too, since `confirm` awaits a human. Structured errors (code+message+details) survive to the model
(D8).

**D6. Reader layout = ONE preset enum.** `layoutPreset: 'classic' | 'compact'
| 'top'`, adaptive internally; meanings fixed in K's design step.

**D7. Bridge tool registry — single source, TWO axes.**
```ts
interface BridgeToolDef { name; description;
  inputSchema: ZodObject<ZodRawShape>;  // SDK tool() takes a RAW SHAPE —
                                        // pass inputSchema.shape to Claude,
                                        // full object to app-side validation
  exposure: 'model' | 'internal';   // may the MODEL call it?
  site: 'app' | 'bridge';           // where does it execute?
  requiresCapability?; timeoutMs?; }
```
Parity rules: Claude tools = Codex allowlist = Codex JSON schema enum =
`exposure:'model'` entries; app executor handles `site:'app'`; bridge runtime
handles `site:'bridge'`; `exposure:'internal'` (`authorize_capability`,
`get_image_binary`) NEVER appears on any model surface. The registry lives in
**`lib/ai/bridge-tools.ts`** (platform-neutral — Expo must not import Node
code from `tools/ai-bridge/`); the bridge imports it like it already imports
`lib/bridge-protocol.ts`. The Codex JSON schema stays CHECKED-IN; the parity
test COMPARES it against the registry and fails on drift — tests must not
write production files as a side effect (regenerate manually or via a
prebuild script when it fails).

**D8. Session lifecycle + structured errors + image payload policy.**
(a) `session_end` message; a `session_start` may replace an existing session
IMMEDIATELY whenever the old session's socket is not OPEN (a dead socket
means no live client to protect — a TTL-only rule would lock users out for
30 s after every crash/reload, since `session_end` on unload is not
guaranteed and `sessionId` lives only in client memory). Additionally the
client persists its `sessionId` in `sessionStorage` so a same-tab reload
prefers resume over replacement. Active-socket takeover stays refused.
(b) `resolveTool` preserves `{errorCode, errorMessage, details}`; providers
surface them to the model. (c) Two-tier limits: server `maxPayload` = 
`MAX_IMAGE_MESSAGE_BYTES = 8_000_000`, but a per-message helper
`maxBytesForEnvelope(type, payload)` re-imposes 1 MB on everything except
`image_result` and `tool_result` marked `binaryTool: true` — and
server-side the flag is only a hint: the oversized `tool_result` must match
a PENDING invocation whose registry entry has `binaryResult: true`. **Decoded image
cap ≈ 5.5 MB** (8 MB envelope minus base64 overhead) in BOTH directions:
oversized OpenAI responses are re-requested at lower quality or rejected
with a structured error; oversized local assets are downscaled app-side
before `edit_image` or rejected with a clear message. Received base64 →
Blob URL immediately; never persisted.

**D9. Characters are edited by delta, through NARROW AI-facing types.**
`Character` embeds `sprites[].uri/assetUri` — exposing it to the model would
violate the round-1 invariant that asset URIs never reach the model, and
would let it forge `id`/`createdAt`. So the changeset uses dedicated shapes:
`AiCharacterCreate { tempId: "newchar:<slug>"; name; color? }` (real id +
`createdAt` generated by the core; NO sprites) and `AiCharacterUpdate
{ characterId; updates: { name?; color? } }` — sprites and URIs are entirely
off-limits to AI in round 2. Character tempIds are deep-resolved wherever
timeline steps reference a character id, like scene tempIds. No delete;
library revision hash; duplicate-id and dangling-reference validation. The
apply result's `charactersToSave` is the FULL final library (the store writes
libraries whole).

**D10. Chat history is UI transcript only.** Per-story `messagesByStory`,
FIFO cap 200 messages AND a per-story byte cap (safety net); pendings and
base64 never persisted; visible "assistant doesn't remember previous
conversations" note. Feeding transcript back into the prompt = round 3.

## Work packages & dependency graph

| Pkg | What | Depends on | Executor |
|-----|------|-----------|----------|
| E | Bridge foundation: registry (D7), errors/lifecycle/payload (D8) | — | Opus |
| F | AiChangeSet pure core (D3, D3b, D9) | — (parallel with E) | Opus |
| G | Store adapter: atomic commit, LIFO journal, G1 restore fix (D2) | F | Sonnet |
| H | ChangeSet diff UI + `propose_changeset` wiring | E, F, **G** | Sonnet |
| M | Connection onboarding (D4) | E | Sonnet |
| N | Polish: language, transcript (D10), markdown | — | ChatGPT/Sonnet |
| L | Access levels + full ownership of `authorize_capability` (D5) | E, **G, H** | Sonnet |
| J | App-side images: receiver/card, import, `get_image_binary`, `remove_background` | E, **L** | Sonnet |
| I | Bridge-side `generate_image`/`edit_image` + BridgeToolRuntime (D1) | E, L, **J** | Opus |
| K | Reader layout preset (D6) | E, G + design pass; **conflicts with I** | Sonnet |

**Order: E ∥ F → G → H → M → N → L → J → I → K.**
I comes AFTER J because both of I's app-side RPCs (`authorize_capability`
from L, `get_image_binary` from J) must actually exist before the bridge
calls them. L needs G (journal entries for auto-applies) and H merged (it
rewires the same executor paths). K is NOT independent: it edits the tool
registry, `system-prompt.md`, and the appearance adapter — all files I also
touches — so K stays last; its design pass may happen earlier at any time.
⚠️ H, M, N, L, J all touch `AiChatPanel.tsx` / `ai-chat-store.ts` /
`translations.ts` — hand out strictly one at a time.

Main-session (not delegated): integration per package, full-flow E2E
(changeset apply → reader actually navigates the new branch — needs a
reader-rendering test, noted; generate → import → use in scene; pairing →
message → reply), first live Codex run.

## Acceptance criteria (round 2 done when)

1. "Create a branch: two new scenes after scene X with a choice" → ONE confirm
   card; Apply creates both scenes; the reader navigates into both branches
   (option targets set); Rollback restores full story state incl.
   `sceneOrder`/`startSceneId`, and refuses silently destroying manual edits
   made after apply.
2. "Generate a background" → preflight (with estimated cost range) BEFORE the
   API call; result ≤5.5 MB decoded delivered over the type-gated envelope;
   if the socket drops before the app acked (`image_result_ack`), the result
   is redelivered on resume and dedup renders exactly ONE card; imported only
   via explicit button through `addAssetToLibrary` + the
   `addImageAssetToStory` STORE action. Changeset rollback never deletes
   imported images.
3. Registry parity test green across all four surfaces; internal tools
   invisible to models; Codex verified live at least once.
4. No-`.env` user connects by pasting the printed token; "Connected" appears
   only after `session_started`; page reload reconnects IMMEDIATELY (dead
   socket ⇒ instant replacement, and sessionStorage-persisted sessionId
   prefers resume — no 30 s lockout); wrong token stops the retry loop with a
   clear message.
5. `blocked` image capability ⇒ zero OpenAI spend + structured
   `PERMISSION_DENIED` reaches the model; `auto` appearance ⇒ applies without
   a card, with a journal entry.
6. Chat replies in the user's language; transcript survives reload and story
   switching (per-story isolation), with caps; markdown renders with
   http/https/mailto-only links.
