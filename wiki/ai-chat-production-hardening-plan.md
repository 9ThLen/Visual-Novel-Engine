# AI Assistant — Production Hardening Plan (v1.3)

Status: implementation in progress; v1.3 also corrects the undo metadata scope
after verifying the current snapshot restore behavior (see section 11)  
Created: 2026-07-16  
Scope: close the remaining correctness, security, durability, UX, and release
gaps after AI Chat Round 2.

This document is intentionally separate from
`wiki/ai-chat-round2-plan.md`. Round 2 describes the feature implementation;
this plan describes the work required before the integration can honestly be
called complete for end users.

## 1. Goal and release boundary

The target of this plan is a reliable **local desktop-web AI integration**:

- Claude Code and Codex can be paired through the local bridge.
- The model only receives story data through the app tools that the product
  exposes.
- A story switch cannot leak pending actions, images, undo controls, or model
  context into another story.
- Messages are sent only through an authenticated session.
- Provider conversation state and the visible transcript have matching reset
  semantics.
- Paid image results survive reloads before import.
- Undo never silently destroys newer manual work and remains usable after a
  reload.
- The connection flow no longer requires a source checkout or `pnpm`.
- Automated browser tests cover the real WebSocket/UI lifecycle; authenticated
  Claude/Codex runs remain explicit release smoke tests.

This plan does **not** add LAN, mobile, tablet-native, TLS pairing, a hosted AI
proxy, Gemini, variable editing, or unrestricted automatic paid image
generation. Unsupported environments must be hidden or labelled clearly rather
than appearing broken.

## 2. Verified current-state findings

The following claims were rechecked against the current worktree on
2026-07-16.

### Blockers

1. **Codex has a model-visible local tool risk.**
   `tools/ai-bridge/src/codex-provider.ts` runs `codex exec` from inside the
   repository with `--sandbox read-only`. The system prompt asks Codex not to
   use the filesystem, but a prompt is not a security boundary. Official Codex
   documentation says read-only mode can inspect files, and the default shell
   tool is enabled unless explicitly disabled:
   - https://learn.chatgpt.com/docs/sandboxing
   - https://learn.chatgpt.com/docs/config-file/config-reference
   - https://learn.chatgpt.com/docs/developer-commands?surface=cli

2. **Pending confirmations are global, not story-scoped.**
   `stores/ai-chat-store.ts` has global `pendingPatch`,
   `pendingAppearance`, `pendingChangeSet`, `pendingCapability`, and a global
   `status`. `setActiveStory()` changes only the transcript view. Switching
   story A → B can therefore render a proposal created for A while B is active.

3. **The UI can enter `thinking` before an authenticated connection exists.**
   `components/ai-chat/AiChatPanel.tsx` treats any non-null `bridgeRef` as a
   usable real provider. `lib/bridge-client.ts` queues messages while the socket
   is not open. A wrong token or fatal connection failure can leave a user
   message visible without a delivered turn.

4. **A paid image is acknowledged before it is durable.**
   `AiChatPanel` decodes an `image_result`, creates an in-memory Blob URL, adds
   it to React state, and immediately sends `image_result_ack`. The bridge then
   deletes its buffered copy. Reloading or crashing before import loses the
   paid result.

5. **Undo confirmation is implemented in the core but not in the UI.**
   `rollbackTopAppliedChange()` returns `requiresConfirmation: true` when newer
   edits exist. `AiChatPanel` ignores the flag and shows a generic rollback
   failure. Appearance entries also capture every scene revision, so unrelated
   scene edits can incorrectly block a theme-only rollback.

6. **Undo is also global across stories and disappears on reload.**
   `appliedChanges` and `lastAppliedChange` are global. The AI panel for story B
   can offer the latest change made in story A. The persist `partialize` stores
   transcripts only, so all undo entries vanish after reload.

7. **“Clear chat” does not clear provider memory.**
   The button only calls `clearMessages(storyId)`. Codex keeps its `threadId`,
   so the model can remember content that the UI claims was cleared.

8. **Provider memory is inconsistent.**
   Codex resumes a thread. Claude creates a fresh SDK `query()` for every turn
   and does not pass the SDK `resume` option, even though the installed SDK
   exposes resumable `session_id` values.

### Product and release gaps

9. `BridgeClient.interrupt()` and server-side turn interruption exist, but the
   UI has no Stop action.
10. The current onboarding and README use `codex --login`; the current command
    is `codex login`.
11. Image generation can be configured as `auto`, allowing paid calls without a
    per-call confirmation or budget.
12. The privacy copy mentions the selected chat provider but does not explain
    that image prompts/source images may additionally be sent to OpenAI Images
    when Claude is the chat provider.
13. Image cost ranges are hard-coded and may become stale; unknown models still
    need honest “estimate unavailable” behavior.
14. `ImageResultCard` does not surface import failures to the user.
15. The AI tab is rendered by `DocumentRightRail` without an explicit web-only
    support gate.
16. `pnpm ai-bridge` requires the repository, Node dependencies, and pnpm. This
    is a developer flow, not an end-user distribution.
17. The repository has no browser AI E2E suite. `e2e/package.json` is a Detox
    mobile configuration, while the AI chat is web-only.
18. Zustand commits are atomic in memory, but app persistence is multi-write and
    not crash-transactional. The release copy must not promise crash-durable
    story mutations.
19. Story snapshot capacity remains 10. When all 10 are manual, a new automatic
    AI snapshot can evict the oldest manual snapshot. This is accepted behavior
    but must remain visible in copy/tests.

## 3. Architecture decisions

### D1. Codex is fail-closed and tool-less

Do not rely on “do not read files” in the system prompt.

Before shipping the Codex provider, prove that the invoked Codex version has no
model-visible built-in data-access tools:

- use an empty temporary workspace outside the repository and pass it through
  both process `cwd` and `codex exec --cd`;
- pass explicit config overrides to disable the default shell tool, web search,
  multi-agent tools, hooks, memories, and remote plugin discovery;
- pass `--ignore-user-config` and `--ignore-rules` on every fresh and resumed
  Codex invocation so user MCP/plugin config and exec-policy rules are not
  loaded;
- scrub the child environment so bridge tokens, image API keys, repository
  secrets, and unrelated credentials are not inherited;
- do not load project-local Codex configuration from the VNE repository;
- delete the temporary workspace when the provider session closes;
- if the installed Codex version rejects a mandatory hardening option, expose a
  structured `CODEX_HARDENING_UNSUPPORTED` error and do not silently start with
  weaker settings.

Verified against the installed CLI (`codex-cli 0.134.0`, this machine,
2026-07-16 — these facts supersede the documentation links above):

- `codex exec --ignore-user-config` exists and is the **primary** config
  boundary: the user's `config.toml` — including configured MCP servers and
  plugins — never loads. This is not hypothetical: this machine has a `github`
  MCP server (bearer token) and a `node_repl` MCP server enabled, which a
  default `codex exec` would inherit. `--ignore-rules` is also required so
  user/project exec-policy rules cannot alter the invocation.
- `-c features.<name>=false` overrides are reflected in `codex features list`
  when run with the same `-c` flags (verified for `shell_tool` and
  `browser_use`). However, in 0.134.0 `codex features list` does **not** accept
  `--ignore-user-config`; the command fails with `unexpected argument`.
  Therefore run the feature probe with an isolated temporary `CODEX_HOME` and
  the final override set. Treat this as a compatibility/configuration check,
  not as proof that every model-visible tool is absent.
- The deny-list must include **all** stable-true tool surfaces, not just the
  original five. Verified stable-true in 0.134.0: `shell_tool`, `browser_use`,
  `browser_use_external`, `computer_use`, `in_app_browser`, `apps`,
  `image_generation`, `multi_agent`, `hooks`, `plugin_sharing`,
  `skill_mcp_dependency_install`, `goals`. Re-derive the list from
  `codex features list` for the installed version; any stable-true feature not
  on an explicit allowlist also fails closed.
- `web_search_request`/`web_search_cached` are *deprecated* flags in 0.134.0
  and `web_search="disabled"` is unverified — derive the correct key from the
  features gate instead of hard-coding it.
- `features.remote_plugin` and `features.memories` are already default-false
  in 0.134.0; keep them on the deny-list anyway (defaults may change).
- `codex exec --help` in 0.134.0 exposes no explicit “disable every built-in
  tool” or model-tool allowlist option. Consequently the feature probe alone
  cannot establish the release invariant that the model receives data only
  through VNE app tools. P0 must first produce a deterministic invocation-level
  proof of a zero-data-access tool surface. If the installed CLI cannot provide
  that boundary, Codex remains disabled and the release ships Claude only.
- For resumed turns, hardening options must be placed before the `resume`
  subcommand, for example `codex exec <common hardening flags> resume
  <threadId> ...`. `codex exec resume --help` does not expose its own
  `--sandbox` or `--cd` options, while the parent `exec` parser accepts them
  before `resume`. Build one tested common prefix for fresh and resumed turns.
- Windows enforcement exists: `codex sandbox` runs commands under a
  "Windows restricted token sandbox" (verified in `--help` output), so
  `--sandbox read-only` is not merely advisory on Windows. The features gate
  remains mandatory on every platform, but the OS sandbox is defense in depth
  and does not by itself prove a tool-less model surface.

An empty `cwd` alone is defense in depth, not the primary boundary.

If a zero-tool Codex invocation cannot be demonstrated deterministically, the
release must disable the Codex provider and keep Claude available. Do not reduce
this gate to a prompt-injection smoke test.

### D2. Supported-platform detection is explicit

Round 3 supports local desktop web only. Add one shared helper that determines:

- `supported`: web + local/approved browser environment + WebSocket support;
- `unsupported-native`: Android/iOS;
- `unsupported-hosted`: a browser origin the local bridge design cannot
  support safely.

The AI tab is hidden or replaced with a clear support message outside the
supported boundary. Do not attempt LAN/TLS/mobile support as an incidental
change.

### D3. One story-scoped pending interaction

Replace four unrelated global pending fields with one discriminated union:

```ts
type AiPendingInteraction =
  | { kind: 'scene_patch'; storyId: string; value: AiChatPendingPatch }
  | { kind: 'appearance'; storyId: string; value: AiChatPendingAppearance }
  | { kind: 'changeset'; storyId: string; value: AiChatPendingChangeSet }
  | { kind: 'capability'; storyId: string; value: AiChatPendingCapability };
```

Only one interaction may wait for a decision at a time. Story switching,
disconnecting, resetting, or unmounting must resolve the bridge tool call as
declined/cancelled and clear the interaction. Pending promise resolvers remain
in component/session memory and are never persisted.

### D4. Messages require an authenticated session

The UI may send to the real provider only when `connectionState ===
'connected'`. Socket-open is insufficient.

`BridgeClient.sendUserMessage()` must return an explicit delivery result rather
than silently accepting an undeliverable message. New user messages are not
queued while connecting, unauthorized, or fatally disconnected. The composer:

- is enabled in demo mode;
- is enabled for the real provider only when authenticated;
- restores the draft and shows a localized error if a connected-state race
  prevents delivery;
- never silently falls back to the fake agent when a real bridge is configured
  but unavailable.

Fatal connection transitions clear `thinking`, partial assistant text, and any
undeliverable queued work.

### D5. Conversation reset is a protocol operation

Add:

```text
client: conversation_reset
server: conversation_reset_ack
```

`AgentProvider` gains `resetConversation()`. Clear chat performs provider reset
first and clears the visible per-story transcript only after the acknowledgement
(demo mode clears immediately).

- Codex reset discards the current `threadId`.
- Claude reset discards/deletes the current SDK session id.
- Reset during a running turn first interrupts that turn.
- Reset failure leaves the transcript intact and shows a localized error.

### D6. Claude and Codex remember the same unit of conversation

Both providers remember turns for the lifetime of the active bridge session.

- Claude captures the SDK `session_id` and passes `resume` on the next query.
- Codex continues using `exec resume`.
- A story change creates a new bridge/provider session.
- Clear chat resets the provider session for the active story.
- Restarting the bridge starts a new model conversation unless a later,
  explicitly designed durable provider-session feature is added.

The UI copy must describe this honestly. Remove the current unconditional note
that the assistant never remembers previous conversations.

### D7. Stop is a first-class state transition

While a real-provider turn is running, show a Stop button. It calls
`BridgeClient.interrupt()`, disables itself after the first click, waits for
`assistant_done { stopReason: 'interrupted' }`, and returns the chat to idle.
Partial text may remain visible but must be marked as interrupted or committed
as a partial assistant message consistently.

### D8. Image acknowledgement means durable receipt

Introduce a web-only pending-image repository **inside the existing
`lib/idb-storage.ts` layer** — the project already owns the `vne-storage`
IndexedDB database with `kv` + `media` object stores, `idb://media/` URIs, and
a jsdom test seam. Do not create a second database or abstraction (that would
violate section 7). Add a `pending-images` object store to the same database:
this requires bumping `DATABASE_VERSION` 1 → 2 with an `onupgradeneeded`
handler, and the cached open-promise (`databasePromises`) must tolerate the
upgrade. Store:

```ts
interface PendingAiImage {
  requestId: string;
  storyId: string;
  purpose: string;
  prompt: string;
  mimeType: string;
  blob: Blob;
  width?: number;
  height?: number;
  estimatedCostUsd?: unknown;
  createdAt: number;
}
```

Delivery sequence:

1. validate and decode base64;
2. persist Blob + metadata transactionally by `requestId`;
3. render from the durable record;
4. only then send `image_result_ack`.

On reload, restore pending images for the active story. Duplicate delivery
finds the durable record and acknowledges without rendering a second card.
Import copies the durable Blob through `addAssetToLibrary`, calls the
`addImageAssetToStory` store action, then deletes the pending record. Discard
deletes it without importing.

Use bounded cleanup: per-story/global count cap, byte cap, age cap, and cleanup
for deleted stories. If persistence fails, do not acknowledge; keep a visible
retry/error state while the bridge retains its buffered copy.

App-side `remove_background` results use the same durable inbox before display.

### D9. Paid image generation is confirm-only in this round

Until there is a real user budget, `image_generate` supports only `confirm` and
`blocked`. Normalize legacy `auto` to `confirm` and remove Automatic from this
capability's UI.

The confirmation chip receives structured estimate data and displays:

- image provider;
- model;
- size/quality;
- approximate cost range, or “estimate unavailable”;
- disclosure that prompts/source images go to the image provider.

The current local `remove_background` operation may share this capability and
therefore also require confirmation. Splitting local image processing into a
separate capability is deferred unless user research shows the extra setting is
needed.

### D10. Undo is story-scoped, scope-aware, and durable

Replace the global journal with `appliedChangesByStory`.

Each entry declares exactly what rollback overwrites:

- appearance: theme/layout only;
- scene patch: all scenes + story metadata, because snapshot restore replaces
  the story scene state;
- changeset: all scenes + story metadata + affected character state.

`hasNewerEdits()` compares only this scope. Therefore an unrelated scene edit
does not block appearance rollback, while a later theme edit does.

Scope precision for scene/changeset entries: current snapshot restore replaces
the scene map and restores `title`, `startSceneId`, `sceneOrder`, and `tags`.
The scene-scope metadata comparison therefore includes all four fields so a
forced rollback cannot silently overwrite newer title/tag edits.

When newer edits exist, show a real confirmation dialog:

- Cancel;
- Undo anyway, with copy explaining which newer work may be overwritten.

Persist the bounded journal so undo survives reload. Do not persist
`previousCharacterLibrary` wholesale. Round-2 character changes only create a
character or change `name`/`color`, so record a compact character undo delta:

```ts
interface CharacterUndoDelta {
  createdCharacterIds: string[];
  previousValues: Array<{
    id: string;
    name: string;
    color?: string;
  }>;
}
```

This avoids duplicating sprite/asset URIs and makes the rollback artifact
bounded. On hydration, prune entries for deleted stories or missing snapshots.
Snapshot eviction continues to remove dependent journal entries.

### D11. The bridge becomes a standalone user-facing CLI

Keep `pnpm ai-bridge` for repository development, but ship a bundled Node CLI
that does not require the source tree:

```text
npx <final-package-name> --provider claude
npx <final-package-name> --provider codex
```

Use the existing `esbuild` dependency to bundle shared bridge protocol/tool
definitions and include `system-prompt.md` plus
`codex-response-schema.json`. Add a package/bin manifest, license/readme, pack
smoke test, and version output.

The image API key stays bridge-side in the environment. Never copy provider or
image API credentials into the browser store. The package name/publication
namespace is a release decision, but the repository must be able to produce and
smoke-test the tarball before this package is called complete.

### D12. Browser E2E is the release gate

Detox is not suitable for this web-only feature. Add Playwright as the one
justified dev dependency for browser automation.

Use two tiers:

1. deterministic CI E2E with an in-process fake provider and real WebSocket
   bridge;
2. opt-in authenticated smoke runs for Claude and Codex, never required in
   ordinary CI.

## 4. Work packages

### Package P0 — Security boundary and command correctness

Depends on: none

Primary files:

- `tools/ai-bridge/src/codex-provider.ts`
- new `tools/ai-bridge/src/codex-launch-policy.ts`
- `tools/ai-bridge/src/main.ts`
- `tools/ai-bridge/src/cli-launcher.ts`
- `components/ai-chat/ConnectionCard.tsx`
- `tools/ai-bridge/README.md`
- Codex provider/CLI unit tests

Tasks:

1. Start with a bounded security spike: determine whether the installed Codex
   CLI exposes a deterministic invocation-level way to remove every
   model-visible filesystem, shell, browser, app, MCP, plugin, and network data
   tool. A feature-list check or prompt instruction alone is insufficient.
   If the proof cannot be produced, keep Codex disabled and continue the plan
   with Claude as the supported provider.
2. Extract pure builders for the common fresh/resume Codex arg prefix, safe
   environment, temporary workspace, and isolated feature-probe environment.
3. Add the fail-closed compatibility gate from D1: the feature probe runs under
   a temporary clean `CODEX_HOME`; actual `exec` calls use
   `--ignore-user-config`, `--ignore-rules`, the empty workspace, and the same
   mandatory overrides.
4. Ensure both fresh `exec` and `exec ... resume` use the common hardening
   prefix, and ensure abort/close removes the temporary workspace.
5. Map unsupported hardening to a structured provider error and localized UI
   guidance.
6. Replace every `codex --login` instruction with `codex login`; retain
   `codex login status` for the auth check.
7. Add tests proving the child launch configuration does not inherit
   `AI_BRIDGE_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or arbitrary
   `*_TOKEN`/`*_SECRET` values.

Required tests:

- security-spike result is encoded as a deterministic capability check, not a
  prose/manual assertion;
- exact mandatory Codex config overrides for both fresh and resumed turns;
- empty workspace outside the repository;
- actual exec args contain `--ignore-user-config` and `--ignore-rules`;
- feature probe uses an isolated `CODEX_HOME` and never passes the unsupported
  `features list --ignore-user-config` form;
- parent hardening flags occur before the `resume` subcommand;
- dangerous environment values absent;
- temporary workspace removed on close/error;
- unsupported CLI option fails closed;
- login command/docs parity.

Acceptance:

- The Codex provider cannot start unless the zero-data-access boundary is
  proven for the installed CLI. Otherwise it is visibly unavailable while
  Claude remains usable.
- No security claim depends only on the system prompt.

### Package P1 — Story isolation, authenticated delivery, Stop

Depends on: P0 only for final integration; code can be developed independently.

Primary files:

- `stores/ai-chat-store.ts`
- `components/ai-chat/AiChatPanel.tsx`
- `lib/bridge-client.ts`
- `lib/translations.ts`
- existing AI panel/client/store tests

Tasks:

1. Replace the four pending fields with the story-scoped union from D3.
2. Add one cancellation path used by story switch, disconnect, reset, and
   unmount.
3. Make real-provider send require authenticated `connected`.
4. Give `sendUserMessage` an explicit success/failure return and remove silent
   pre-auth delivery.
5. Reset `thinking` and partial response buffers on fatal connection errors.
   Also clear the client send queue on fatal transitions: `blockReconnect()`
   currently leaves `this.queue` populated (`lib/bridge-client.ts`), so a
   message queued before `UNAUTHORIZED` would flush into a later successful
   session as a stale duplicate.
6. Add the Stop action and interrupted-turn state handling.
7. Keep fake-agent behavior available only in explicit demo mode.

Required tests:

- pending proposal in A → switch to B → proposal is declined and invisible;
- capability confirmation in A cannot resolve from B;
- send while connecting/unauthorized is disabled;
- connected-state send race restores the draft and exits `thinking`;
- wrong token never leaves a queued turn;
- message queued while connecting → `INVALID_TOKEN` → reconnect with a valid
  token → the stale message is not delivered;
- Stop emits one interrupt and returns to idle;
- real bridge failure never invokes the fake agent.

Acceptance:

- No visible or executable pending state crosses story boundaries.
- Every displayed user turn is either delivered or visibly rejected.

### Package P2 — Conversation lifecycle parity

Depends on: P1

Primary files:

- `lib/bridge-protocol.ts`
- `lib/bridge-client.ts`
- `tools/ai-bridge/src/provider.ts`
- `tools/ai-bridge/src/server.ts`
- `tools/ai-bridge/src/claude-provider.ts`
- `tools/ai-bridge/src/codex-provider.ts`
- `components/ai-chat/AiChatPanel.tsx`
- provider/server/client tests

Tasks:

1. Add `conversation_reset` / `conversation_reset_ack`. Note the closed-union
   mechanics: both types must be added to the envelope message-type unions in
   `lib/bridge-protocol.ts` (client and server lists, `isServerMessage`,
   `maxBytesForEnvelope`), and `BRIDGE_PROTOCOL_VERSION` must be bumped so a
   mismatched app/bridge pair fails through the existing
   `PROTOCOL_VERSION_MISMATCH` path instead of an unknown-message dead end.
2. Add `resetConversation()` to every provider.
3. Capture Claude SDK `session_id` and use `options.resume` on subsequent turns.
4. Clear Claude/Codex provider state on reset.
5. Make Clear chat wait for reset acknowledgement.
6. Define reset-during-turn as interrupt → reset → acknowledgement.
7. Replace the stateless-memory copy with accurate session-lifetime copy.

Required tests:

- Claude second turn receives the first session id through `resume`;
- Claude reset makes the next turn start without `resume`;
- Codex reset makes the next turn use `exec`, not `exec resume`;
- Clear chat does not clear local messages before ack;
- reset failure retains transcript;
- story switch creates fresh provider memory;
- bridge socket resume preserves the same provider conversation.

Acceptance:

- Visible transcript clearing and provider memory clearing are one operation.
- Claude and Codex have the same documented memory boundary.

### Package P3 — Durable image inbox, cost, and privacy

Depends on: P1, P2

Primary files:

- `lib/idb-storage.ts` (new `pending-images` object store, version bump)
- new `lib/ai/pending-image-storage.web.ts`
- optional storage interface/test double in `lib/ai/pending-image-storage.ts`
- `lib/ai/image-tools.ts`
- `components/ai-chat/AiChatPanel.tsx`
- `components/ai-chat/ImageResultCard.tsx`
- `components/ai-chat/CapabilityConfirmChip.tsx`
- `components/ai-chat/AiPermissionSettings.tsx`
- `lib/ai/permissions.ts`
- `tools/ai-bridge/src/image-tools.ts`
- `lib/translations.ts`
- image/permission tests

Tasks:

1. Implement the IndexedDB pending-image repository and caps.
2. Persist before ack; restore per-story cards after reload.
3. Route `remove_background` through the same repository.
4. Add visible import/persistence failures and Retry where possible.
5. Delete pending records only after successful import or explicit discard.
6. Make `image_generate` confirm/blocked only.
7. Pass structured estimate/provider/model data to the confirmation UI.
8. Treat unknown or outdated pricing data as estimate unavailable.
9. Update privacy and API-key setup copy for the secondary image provider.

Required tests:

- image received → persisted → acked, in that order;
- persistence failure → no ack;
- reload before import → one restored card;
- bridge redelivery → no duplicate;
- import failure → card and durable record remain;
- successful import uses both media-library steps, then deletes pending record;
- discard deletes pending record;
- story deletion/TTL/cap cleanup;
- legacy `image_generate:auto` normalizes to `confirm`;
- Claude chat + OpenAI image path displays both processors.

Acceptance:

- A paid result survives reload before import and is rendered exactly once.
- No base64 image is persisted in the transcript or app settings.

### Package P4 — Correct and durable undo

Depends on: P3 (same store/panel/translation hotspots; merge sequentially)

Primary files:

- `stores/ai-chat-store.ts`
- `lib/ai/applied-change-journal.ts`
- `lib/ai/scene-patch-adapter.ts`
- `lib/ai/appearance-patch-adapter.ts`
- `lib/ai/change-set-adapter.ts`
- `components/ai-chat/AiChatPanel.tsx`
- new small confirmation component if no existing dialog fits
- journal/adapter/UI tests

Tasks:

1. Change the journal to `appliedChangesByStory`.
2. Add explicit rollback scopes and scope-aware revision capture.
3. Replace full character-library rollback copies with compact undo deltas.
4. Implement the `requiresConfirmation` UI and forced rollback path.
5. Persist the journal with versioning, caps, hydration pruning, and snapshot
   eviction synchronization.
6. Show Undo only for the active story.
7. Keep the existing snapshot-cap behavior and warning copy.

Required tests:

- change in A never exposes Undo in B;
- unrelated scene edit does not block appearance rollback;
- later appearance edit requires confirmation;
- later scene/metadata edit requires confirmation for snapshot rollback;
- cancel preserves all state;
- force rollback works and removes only the active story's top entry;
- journal survives reload;
- missing/evicted snapshot prunes the entry;
- character undo delta restores names/colors and does not overwrite sprites;
- per-story LIFO and caps.

Acceptance:

- Undo cannot silently discard newer manual work.
- Undo remains available after reload when its rollback artifact still exists.

### Package P5 — Platform boundary and standalone bridge

Depends on: P0–P4

Primary files:

- new shared AI support helper
- `components/document-editor/DocumentRightRail.tsx`
- `components/ai-chat/ConnectionCard.tsx`
- `tools/ai-bridge/` build/package files
- root scripts and lockfile
- bridge README and user-facing setup docs

Tasks:

1. Gate the AI tab to the supported local desktop-web environment.
2. Add clear unsupported-platform copy rather than a generic connection error.
3. Bundle a standalone bridge CLI with all non-code assets.
4. Keep `pnpm ai-bridge` as the development alias.
5. Change onboarding to the standalone command while retaining a developer
   details section.
6. Add `--version`, `--help`, provider auth diagnostics, and image-provider
   diagnostics.
7. Add pack/install/start smoke tests in a temporary directory that is not the
   repository.

Required tests:

- native/tablet route does not expose a broken AI connection flow;
- supported local web still renders the AI tab;
- packed CLI starts without repository files/node_modules;
- prompt/schema assets are present in the bundle;
- startup block has one token and correct provider/origin;
- no browser bundle contains provider/image API keys.

Acceptance:

- A normal user does not need the source repository or pnpm to start the bridge.
- Unsupported environments are explicit.

### Package P6 — Browser E2E and release evidence

Depends on: P0–P5

Primary files:

- new Playwright config and web AI E2E tests
- test-only fake provider/harness
- package scripts
- CI configuration if present
- release checklist documentation

Deterministic CI scenarios:

1. Start app + real WebSocket bridge with fake provider.
2. Pair with valid token and observe authenticated Connected.
3. Wrong token stops retry and keeps the composer disabled.
4. Second tab receives stable session-active guidance.
5. Send → streamed reply → idle.
6. Stop a long fake turn.
7. Proposal in story A → switch to B → no stale card.
8. Clear chat → provider reset ack → transcript cleared.
9. Generate fake image → reload before import → one restored card → import.
10. Apply AI change → manual edit → confirmation required → cancel/force paths.

Opt-in live smoke:

```text
AI_E2E_PROVIDER=claude pnpm test:ai-live
AI_E2E_PROVIDER=codex pnpm test:ai-live
```

The live test performs one short Ukrainian turn and no mutation or image spend.
It must record provider/version/result, not credentials or story text.

Acceptance:

- CI proves the browser/WebSocket lifecycle without external accounts.
- Release evidence contains one recent successful live Claude run and one live
  Codex run when Codex passes P0's security gate.

## 5. Dependency order and conflict control

Implementation order:

```text
P0 → P1 → P2 → P3 → P4 → P5 → P6
```

P0 and the initial pure-store part of P1 may be developed in parallel, but final
integration should stay sequential. P1–P4 all touch
`AiChatPanel.tsx`, `ai-chat-store.ts`, and `translations.ts`; do not delegate
those packages concurrently into the same worktree.

After every package:

1. run the narrow unit tests first;
2. run `pnpm check`;
3. run full `pnpm test`;
4. run `git diff --check`;
5. run `graphify update .`;
6. perform the package-specific manual smoke before starting the next package.

Do not make a single commit containing the existing Round 2 implementation plus
all hardening work. Use one reviewed commit per package or one small commit per
coherent task inside a package.

## 6. Final acceptance criteria

The integration may be called complete for the stated release boundary only
when all are true:

1. Codex runs with a proven zero built-in data-access tool surface, or Codex is
   disabled with a clear explanation.
2. Claude and Codex both pass provider-level memory/reset tests.
3. Story A pending state, image state, model context, and undo state never
   appear or execute in story B.
4. The composer cannot send a real-provider message before
   `session_started`.
5. Wrong token, dead bridge, provider error, Stop, and timeout all return the UI
   to a usable state.
6. Clear chat clears both visible transcript and provider memory.
7. A generated image is acknowledged only after durable local storage and
   survives reload before import.
8. Paid image generation always receives a per-call confirmation and honest
   provider/cost disclosure.
9. Undo is per-story, persists across reload, and asks before overwriting newer
   edits.
10. A standalone packed bridge starts outside the repository.
11. Unsupported platforms do not show a misleading connection flow.
12. Deterministic browser E2E is green.
13. `pnpm check`, full `pnpm test`, `git diff --check`, and graph update are
    clean.
14. Recent live Claude and Codex smoke evidence exists; if Codex fails the
    security gate, the release evidence explicitly records it as disabled.

## 7. Explicit non-goals and prohibited shortcuts

- Do not implement LAN/mobile/TLS as part of these fixes.
- Do not store Claude, Codex, OpenAI, or bridge secrets in browser persistence.
- Do not use a system-prompt instruction as a filesystem security control.
- Do not acknowledge images after decode-only or render-only receipt.
- Do not persist live Promise resolvers or pending confirmation state.
- Do not allow automatic paid image generation without a real budget system.
- Do not claim Zustand/app storage is crash-transactional.
- Do not add React Context; keep Zustand and the current app-store boundaries.
- Do not import legacy editor/store modules into the document editor.
- Do not add a second markdown, image-library, or persistence abstraction when
  an existing project abstraction already fits.

## 8. Questions for Claude review

Claude should review this file against the current code, not against prior plan
versions, and answer:

1. Are any verified findings false or already fixed? Cite exact files/lines.
2. Does P0 establish a real Codex boundary on Windows, macOS, and Linux? If not,
   identify the missing tool/config surface and propose a fail-closed fix.
3. Can any pending decision, image, model session, or undo entry still cross
   story boundaries after D3/D6/D8/D10?
4. Is the image ack sequence crash-safe enough for the stated local-web scope?
5. Does the compact character undo delta cover every character mutation Round 2
   currently permits?
6. Are any packages ordered incorrectly or missing a dependency?
7. Do the tests prove the broad acceptance criteria, or only narrow helpers?
8. Is any required end-user flow still repository/developer-only?

Requested review format:

```text
Verdict: ready / ready after fixes / not ready
Blockers: numbered, each with code evidence
Recommendations: numbered, clearly separated from blockers
Rejected assumptions: any plan statement disproved by code
Suggested next-revision edits: exact wording or package changes
```

## 9. Claude review outcome (2026-07-16, applied as v1.1)

Verdict: **ready after fixes** — the fixes are applied in this revision.

All 19 verified findings were re-confirmed against the committed code
(1b7e0015). None are false or already fixed. Key evidence: codex spawn args and
repo `cwd` (`codex-provider.ts:53-57`), global pendings/status
(`ai-chat-store.ts:97-104`), pre-auth `thinking` + queue
(`AiChatPanel.tsx` handleSend, `bridge-client.ts:65-74`), ack-before-durable
(`AiChatPanel.tsx` image_result branch), ignored `requiresConfirmation`
(`AiChatPanel.tsx` handleRollback), global journal + transcript-only
`partialize` (`ai-chat-store.ts:221`), Clear chat = `clearMessages` only,
Claude query without `resume` (`claude-provider.ts:26`; SDK supports resume —
`sdk.d.ts:684`), no Stop UI, `codex --login` broken on codex-cli 0.134.0
(errors: "unexpected argument"), `image_generate` auto allowed
(`permissions.ts`), silent import failure (`ImageResultCard.tsx` try/finally
without catch), no platform gate (`DocumentRightRail.tsx:76`), Detox-only e2e.

Blockers fixed in v1.1:

1. D1's original deny-list missed the verified stable-true tool surfaces
   (`browser_use`, `computer_use`, `in_app_browser`, `apps`,
   `image_generation`, …) and used an unverified `web_search` key; the local
   machine really has `github` (bearer token) and `node_repl` MCP servers
   enabled. Fixed with `--ignore-user-config` + a token-free
   `codex features list` gate.
2. D8 proposed a new IndexedDB abstraction while `lib/idb-storage.ts` already
   owns the `vne-storage` database. Fixed: same DB, new object store, version
   bump.
3. P1 missed the client queue leak: `blockReconnect()` does not clear
   `this.queue`, so a pre-`UNAUTHORIZED` message flushes into a later valid
   session. Fixed: task 5 + a dedicated test.
4. P2 missed the closed-union protocol mechanics and version bump for
   `conversation_reset`. Fixed in task 1.

Answers to section 8: (2) with the v1.1 gate, yes — Windows uses codex's
restricted-token sandbox and the features gate is deterministic on every
platform; (3) no remaining cross-story path, provided D3 clears store state
(not only resolvers) on story switch; (4) persist→render→ack is crash-safe for
the local-web scope; (5) yes — round 2 permits only `create_character` and
`update_character` (name/color) (`change-set.ts:29-30`), so the compact delta
covers everything; (6) order is correct; (7) with the two added tests, yes;
(8) the standalone bridge still requires Node/npx — acceptable, but the wizard
copy must state the Node requirement.

## 10. Codex verification correction (2026-07-16, applied as v1.2)

Verdict: **v1.1 was not yet implementation-ready; v1.2 is ready with P0 as a
release gate.**

Direct checks against `codex-cli 0.134.0` found:

1. `codex features list --ignore-user-config` is invalid and exits with
   `unexpected argument`. The probe must instead run under an isolated
   temporary `CODEX_HOME`.
2. `codex features list` proves only effective feature-flag state. The current
   CLI help exposes no explicit disable-all-tools or model-tool allowlist, so
   the probe does not prove the product invariant that Codex receives data only
   through VNE app tools.
3. `codex exec resume --help` does not expose its own `--sandbox` or `--cd`
   flags. Parent `exec` hardening flags are accepted when placed before
   `resume`; fresh and resumed turns therefore need one common, tested argument
   prefix.
4. `--ignore-rules` is required alongside `--ignore-user-config`.

Resolution:

- P0 begins with a deterministic zero-data-access capability proof.
- If the installed CLI cannot provide that proof, Codex is disabled for the
  release rather than started with a weaker privacy boundary.
- The feature probe remains useful as a token-free compatibility check, but is
  no longer described as the security proof.
- The scene/changeset undo metadata scope is fixed to `startSceneId` +
  `sceneOrder`; the previous “either/or” decision is removed.

## 11. Snapshot metadata correction (2026-07-16, applied as v1.3)

Implementation verification found that `restoreStorySnapshot()` currently
restores `title` and `tags` in addition to `startSceneId` and `sceneOrder`.
Therefore P4 keeps all four metadata fields in the newer-edit revision scope.
This supersedes the final bullet of section 10.
