# OpenAI providers implementation plan

Version: 1.5
Date: 2026-07-17
Status: ready for implementation

## 1. Outcome

Add two clearly separated OpenAI connection modes:

1. **OpenAI API** — the recommended supported provider. The local AI bridge
   calls the OpenAI API and exposes only the Visual Novel Engine model tools.
2. **Codex CLI Beta** — an explicitly experimental provider. It remains
   fail-closed unless runtime hardening checks pass and the user has accepted
   the current versioned risk disclosure.

Claude Code remains supported. Demo mode remains the no-setup fallback.

## 2. Locked product and security decisions

### 2.1 OpenAI API is the recommended OpenAI route

- The API key is read only by the local bridge from `OPENAI_API_KEY`.
- The key is never sent to or persisted by the browser application.
- OpenAI API billing is separate from a ChatGPT subscription. The setup UI
  states this explicitly and never asks the user to paste an API key.
- The OpenAI model receives only the tools in `MODEL_BRIDGE_TOOLS`.
- Tool execution remains app-side and keeps the existing permission,
  confirmation, validation, snapshot, and undo contracts.
- Chat use and image use may share the same bridge-side key, but their provider
  errors and cost disclosures remain separate.
- The default model is bridge-side configuration (`OPENAI_CHAT_MODEL`), not a
  browser setting. The v1 fallback is `gpt-5.6`, verified against the current
  Responses API guidance on 2026-07-16. Keep the fallback in one constant and
  cover the env override with a test so a later model migration is localized.
- Bridge credentials and model configuration are snapshotted at startup.
  Changing the key or model requires restarting the bridge.

### 2.2 Codex CLI Beta consent is one-time but versioned

The full disclosure is shown before Codex CLI Beta is enabled for the first
time. It contains an unchecked checkbox and cannot be accepted implicitly.

Persist:

```ts
export interface CodexBetaConsent {
  acceptedAt: string;
  disclosureVersion: number;
  isolationPolicyVersion: number;
  codexCliVersion: string;
}
```

Consent is valid only when:

- `disclosureVersion === CURRENT_CODEX_DISCLOSURE_VERSION`;
- `isolationPolicyVersion === CURRENT_CODEX_ISOLATION_POLICY_VERSION`;
- the installed CLI version matches the version recorded at acceptance and is
  in the bridge's tested allowlist;
- the user has not reset AI connection settings.

A new full consent is required after a disclosure or isolation-policy change,
after a Codex CLI version change, or after reset. It is not shown on every
session. Connected UI always shows `Codex CLI · Beta` and a persistent short
warning.

Consent acknowledges residual risk. It never bypasses a failed technical
security gate.

### 2.3 Codex remains fail-closed

The current hardening stays mandatory:

- isolated temporary workspace;
- isolated `CODEX_HOME`;
- sanitized environment without application/provider secrets;
- `--ignore-user-config`;
- `--ignore-rules`;
- read-only sandbox;
- network disabled;
- user MCP, plugins, apps, browser/computer use, image generation, memories,
  subagents, hooks, and other nonessential surfaces disabled;
- no approval/escalation path;
- common hardening prefix for fresh and resumed turns;
- temporary data removed on close and failure.

Codex authentication must not undo that isolation:

- Beta supports only credentials stored through the operating-system keyring
  with `cli_auth_credentials_store = "keyring"`;
- file-based `auth.json`, `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN`, provider-key
  environment variables, and copied credentials inside the isolated
  `CODEX_HOME` are rejected;
- the authentication check uses the same isolated `CODEX_HOME`, keyring policy,
  sanitized environment, executable, and hardening flags as the real turn;
- if the platform has no working keyring path, Codex CLI Beta is unavailable.

Threat boundary: the installed Codex executable and local OS account are trust
roots. Resolve one absolute executable path and use it for authentication,
version checks, probes, and turns. Keep a process-local fingerprint and fail
closed if that binary changes while the bridge is running. Never expose its
path to the browser.

Before starting, the bridge must verify the exact CLI version and every
testable hardening invariant. Unknown versions, missing flags, a failed probe,
or an unsupported platform produce a structured provider error. There is no
“continue anyway” action.

For the first Beta release, support may be limited to platforms where the
operating-system sandbox boundary has an automated test. Other platforms stay
disabled instead of receiving weaker guarantees.

## 3. Existing code to reuse

- `AgentProvider` and `AgentProviderFactory` in
  `tools/ai-bridge/src/provider.ts`.
- Bridge provider selection in `tools/ai-bridge/src/main.ts` and
  `tools/ai-bridge/src/cli-options.ts`.
- Canonical model-tool registry in `lib/ai/bridge-tools.ts`.
- Existing confirmation and permission pipeline in the AI chat.
- Current Codex argument/environment builders in
  `tools/ai-bridge/src/codex-launch-policy.ts`.
- Existing connection wizard in `components/ai-chat/ConnectionCard.tsx`.
- `aiBridgeSettings` persistence through `lib/app-store-persistence.ts`.
- Existing fake bridge and Playwright AI scenarios.

Do not add a second tool registry, a second connection store, React Context, or
browser persistence for provider secrets.

## 4. Protocol and data contracts

Extend:

```ts
export type BridgeProvider = 'claude' | 'openai' | 'codex';
```

`session_started` continues to report the actual provider. Protocol v3 uses an
explicit authenticated preflight before creating or resuming a provider:

1. Client sends `session_start` with pairing token, optional resume id,
   provider preference, and optional Codex consent.
2. Server validates the token before returning provider details.
3. Server asynchronously checks readiness and hardening.
4. Missing setup or stale consent returns a typed `session_challenge`; no
   provider is created or resumed.
5. After the user resolves the challenge, the client sends a fresh
   `session_start`.
6. Only a ready request receives `session_started` and becomes connected.

The challenge may carry:

- provider availability;
- CLI version;
- a public platform-profile id;
- hardening failure reason;
- consent required/stale reason;
- OpenAI API authentication/configuration failure.

It must not contain executable paths, usernames, environment values, secrets,
or raw provider output. Resume requests repeat the same preflight and consent
validation before the old session is reattached.

Prefer structured reason codes:

- `OPENAI_API_KEY_MISSING`
- `OPENAI_API_AUTH_FAILED`
- `OPENAI_MODEL_UNAVAILABLE`
- `CODEX_BETA_CONSENT_REQUIRED`
- `CODEX_BETA_CONSENT_STALE`
- `CODEX_KEYRING_REQUIRED`
- `CODEX_KEYRING_UNAVAILABLE`
- `CODEX_KEYRING_NOT_AUTHENTICATED`
- `CODEX_CLI_VERSION_UNSUPPORTED`
- `CODEX_HARDENING_UNSUPPORTED`
- `CODEX_HARDENING_CHECK_FAILED`

Raise `BRIDGE_PROTOCOL_VERSION` from 2 to 3. Adding `openai`, Codex capability
metadata, and versioned client consent changes the handshake contract, and the
current client explicitly recognizes only `claude|codex`. Old client/bridge
pairs must fail with the existing explicit `PROTOCOL_VERSION_MISMATCH` behavior
instead of partially connecting.

Extend `AiBridgeSettings` only with non-secret local UI state:

```ts
type AiBridgeSettings = {
  url: string;
  token: string;
  disabled: boolean;
  preferredProvider?: BridgeProvider;
  codexBetaConsent?: CodexBetaConsent;
};
```

The pairing token remains existing local bridge configuration. The OpenAI API
key must not be added to this type.

`preferredProvider` is onboarding/UI preference only. The bridge process owns
the actual provider selected by `--provider`; `session_started.provider` is
authoritative. A mismatch must be shown honestly instead of silently relabeling
the connection.

## 5. Implementation packages

### O1 — Provider contracts and normalized configuration

Files:

- `lib/bridge-protocol.ts`
- `lib/ai/bridge-config.ts`
- `stores/app-store-initial-state.ts`
- `lib/app-store-persistence.ts`
- `tools/ai-bridge/src/cli-options.ts`
- `.env.example`
- `tools/ai-bridge/README.md`
- relevant translations and tests

Tasks:

1. Add the `openai` provider to shared and CLI unions.
2. Add normalized `preferredProvider` and `codexBetaConsent`.
3. Preserve legacy hydration behavior and reject malformed consent objects,
   including a non-string or invalid ISO `acceptedAt`.
   Raise `APP_STORE_PERSIST_VERSION` from 4 to 5 and add an explicit v4→v5
   migration/merge branch. Missing consent normalizes to absent (fail-closed);
   missing preference uses the initial-state default. Preserve URL, token, and
   `disabled` exactly. Add fixtures for v4, malformed v5, and round-trip v5.
   `APP_STORE_PERSIST_VERSION` covers the whole persisted store, so also add a
   full persisted-state v4 fixture proving the migration is identity for every
   non-bridge slice.
4. Keep secrets out of persisted app state and serialized diagnostics.
5. Add `--enable-codex-beta` to CLI parsing/config/help and keep its default
   `false`.
6. Raise the bridge protocol version to 3 and update mismatch tests.
7. Update help text and provider-specific startup diagnostics.
8. Split CLI authentication from API readiness:
   `checkProviderAuthentication()` must never launch a CLI for `openai`.
9. Add typed `session_challenge` and asynchronous provider-preflight contracts.
10. Document cross-platform `.env` setup, separate API billing, restart after
    key/model changes, and that ChatGPT subscription credentials are not an API
    key.
11. Treat `session_challenge` as a blocked connection state: no automatic
    reconnect loop until the user changes setup, accepts consent, or presses
    Retry.
12. Extend the typed `SessionStartPayload` and `BridgeClient` options/building
    logic with provider preference and optional Codex consent. Validate the same
    shape server-side before preflight. Add an explicit serialized-byte test
    proving the maximum valid consent/challenge stays below
    `MAX_MESSAGE_BYTES`.

Acceptance:

- old persisted state hydrates without losing settings;
- malformed/stale consent is treated as absent;
- no browser bundle or persisted fixture contains `OPENAI_API_KEY`;
- CLI accepts exactly `claude|openai|codex`;
- Codex additionally requires the explicit Beta flag.
- a missing OpenAI key can still start the pairing server and return a
  localized authenticated challenge instead of generic connection refusal.

### O2 — OpenAI Responses API provider

Files:

- new `tools/ai-bridge/src/openai-provider.ts`
- `tools/ai-bridge/src/provider.ts`
- `tools/ai-bridge/src/main.ts`
- bridge package/build configuration
- provider tests

Tasks:

1. Implement `AgentProvider` with the native `fetch` API, matching the existing
   zero-dependency pattern in `image-tools.ts`. Do not add the OpenAI SDK unless
   implementation evidence shows that the raw Responses API lifecycle cannot
   be kept small and correct.
2. Convert only `MODEL_BRIDGE_TOOLS` to OpenAI function tools using the
   installed Zod 4 JSON Schema converter. Keep `strict: false` in v1 because
   the canonical schemas contain optional fields that do not satisfy OpenAI
   strict-mode requirements without semantic rewriting. Keep Zod
   `.superRefine()` checks runtime-only and test every generated tool schema for
   API-serializable JSON Schema plus parity with the canonical registry.
3. Set `parallel_tool_calls: false`; the app has one pending-confirmation slot.
   Defensively reject a response containing more than one function call.
4. Move canonical `inputSchema.safeParse()` validation into
   `BridgeToolRuntime.call()` before app-side or bridge-side dispatch, so every
   provider enforces the same schema. With `strict: false` the model can emit
   invalid arguments; a validation failure returns a structured function-call
   error output to the model so it can correct itself, counts against the
   provider round cap, and must not fail the whole turn. On success, dispatch
   `parsed.data`, never the original untrusted input, so Zod defaults,
   transforms, and unknown-key handling are actually enforced.
5. Keep tool calls in the existing bridge loop and return structured tool
   results through the same error normalization.
6. Stream text as `AgentEvent`. Own one `AbortController` per turn, pass its
   signal to every fetch, check `signal.aborted` between tool-loop iterations,
   race pending tool calls against abort, and ignore late tool results.
7. Maintain a bounded, in-memory Responses API item history with `store:false`.
   Append user inputs and all required response output items/tool-call outputs,
   and send the bounded history on the next turn. Do not use durable
   Conversations or `previous_response_id` in v1 because provider-side response
   retention is not required for a bridge-session-only memory contract.
   Preserve every output item, including encrypted reasoning items and
   assistant `phase`, and keep reasoning items with tool-call outputs.
   Current Responses API behavior returns `encrypted_content` by default in
   stateless mode (`store:false`). The legacy-compatible
   `include: ["reasoning.encrypted_content"]` may still be sent explicitly, but
   correctness must not depend on that parameter. Before committing a complete
   turn to local history, verify that every returned reasoning item that must
   be replayed contains its replayable encrypted content; otherwise fail the
   turn with a structured malformed-response error and leave prior history
   unchanged.
   `resetConversation()` clears the history. Enforce item and estimated
   serialized-byte/token budgets before every request. Compact only at complete
   turn boundaries; never split reasoning/function-call/output groups.
8. Read `OPENAI_API_KEY` and `OPENAI_CHAT_MODEL` only in the bridge process.
9. Map authentication, rate-limit, timeout, model, refusal, incomplete
   response, malformed-response, and abort failures to structured errors
   without exposing response bodies or credentials.
10. Use `buildSessionSystemPrompt()` so OpenAI follows the same language,
    revision, story-tool, and safety contract as Claude. Send it as the
    per-request `instructions` field, not as a history item: it is re-sent on
    every request, is never subject to history compaction, and its size counts
    toward the estimated request budget.
11. Ensure image capability authorization remains separate from chat turns.
12. Reuse the existing API-key redaction pattern from `image-tools.ts` and the
   final server redaction guard rather than introducing another logger policy.
13. Retry at most once: honor a bounded `Retry-After` for 429, use bounded
    exponential backoff for 500/502/503/504, and never retry 400/401/403 or an
    aborted request. Retry a streamed request only before any response event,
    text delta, or tool call has been observed; never replay a partial turn.
    Map request timeout to `OPENAI_API_TIMEOUT`.
14. Read chat and image credentials from the same `OPENAI_API_KEY`. An
    authentication failure is reported by the operation that encountered it;
    it does not globally disable the other subsystem without its own failed
    request.
15. Capture response usage in privacy-safe bridge diagnostics (model, request
    id, input/output/total token counts; never prompt text). Add per-turn output
    limits and an optional bridge-side session token budget. Do not claim exact
    currency cost unless a versioned pricing source is implemented.
16. Add a provider-local maximum Responses round count in addition to the
    server tool-call and turn-time limits.
17. Keep the production API URL fixed. Inject `fetch` and a test-only endpoint
    through the provider constructor; do not add a user-controlled endpoint
    that could become an SSRF surface.
18. Bound SSE event size, accumulated stream bytes, function arguments, and
    serialized tool-output bytes before they enter provider history or another
    API request. Encode every `function_call_output.output` with standard
    `JSON.stringify` (including structured success/error values), handle
    serialization failure explicitly, and apply the byte cap to the encoded
    UTF-8 payload rather than to an object estimate.
19. Replace the two-provider ternary in `main.ts` with an exhaustive provider
    factory switch. OpenAI readiness checks `OPENAI_API_KEY`; it never goes
    through Claude/Codex CLI authentication.
20. Cover bridge-site `generate_image` and `edit_image` end to end: the
    provider must await the normal `BridgeToolRuntime` result, continue the
    Responses loop with its function output, and independently deliver the
    buffered `image_result` envelope for browser persistence/ack.
21. Keep `authorize_capability` internal and provider-agnostic. OpenAI must call
    `generate_image`/`edit_image` as model tools; the shared bridge handler
    performs authorization before spending money.
22. Abort is logical across a pending app tool: stop further provider work and
    ignore its late result. Do not claim that `AbortController` physically
    cancels an already dispatched browser-side confirmation or 600-second app
    tool; a future tool-cancel protocol is separate scope.

Tests:

- exact model-tool parity;
- no bridge-internal tools are model-visible;
- canonical runtime input validation for every provider, dispatching
  `parsed.data` rather than the raw model object;
- generated schema parity, explicit non-strict mode, and disabled parallel tool
  calls;
- multi-step tool call then final response;
- invalid model-generated arguments produce a structured function-output error
  and the loop continues within the round cap;
- every request carries the `instructions` field; stateless reasoning output
  is replayable whether or not the legacy-compatible encrypted-content include
  parameter is sent;
- fragmented/multibyte SSE, keepalives, abrupt EOF, partial-stream failure,
  streaming, and abort;
- reset creates fresh provider memory;
- encrypted reasoning and assistant-phase preservation, including atomic
  failure when required replayable reasoning content is absent;
- standard JSON encoding and UTF-8 byte limiting of function outputs;
- history item/byte budget, atomic-turn compaction, and failure boundary;
- missing/invalid key and rate-limit mapping;
- one bounded retry, `Retry-After`, timeout, no-retry auth behavior, and no
  retry after a partial stream;
- provider-round/tool-loop cap;
- SSE event, total stream, function-argument, and tool-output byte caps;
- bridge image emit + function-output continuation + image ack;
- internal capability preflight remains provider-agnostic;
- logs and errors redact secrets;
- no network test in normal CI: use a deterministic fake HTTP transport.

Acceptance:

- OpenAI can read and propose/apply the same editor operations as Claude;
- it cannot invoke shell, filesystem, browser, MCP, or arbitrary network tools;
- the browser never receives the API key.

### O3 — Codex hardening capability gate

Files:

- `tools/ai-bridge/src/codex-launch-policy.ts`
- `tools/ai-bridge/src/codex-provider.ts`
- `tools/ai-bridge/src/main.ts`
- `tools/ai-bridge/src/cli-launcher.ts`
- hardening tests

Tasks:

1. Replace the unconditional unsupported result with a runtime capability
   report, but only for explicitly allowlisted CLI/platform combinations.
2. Parse and validate the exact Codex CLI version.
3. Resolve and fingerprint one absolute executable and use it for auth,
   version, feature, sandbox, and real-turn invocations.
4. Run compatibility probes with isolated `CODEX_HOME`, keyring-only auth, and
   sanitized env. Reject file/env credentials and verify that no `auth.json`
   exists in the isolated home.
5. Verify mandatory flags for both fresh and resumed invocation.
6. Set approval policy to deny/noninteractive and network to disabled using
   verified CLI configuration.
7. Verify disabled feature state without claiming that feature output alone is
   a complete security proof.
8. Add platform-specific sandbox smoke tests proving that the child cannot:
   - write outside its temporary workspace;
   - read a seeded file outside the allowed boundary;
   - access the network;
   - load user MCP/config/rules.
   Add secret-sentinel probes proving spawned commands cannot read filtered env
   values, `auth.json`, or copied credentials.
9. Return a structured failure report; never silently downgrade hardening.
   Bound and sanitize CLI stdout/stderr before logs or client errors.
10. Keep cleanup idempotent on success, abort, spawn failure, parse failure, and
   process termination, including races where a temporary directory was already
   removed.
11. Treat the initial platform set as test-derived, not assumed. Candidate
    profiles are native Windows elevated sandbox, WSL2/Linux sandbox, macOS
    Seatbelt, and native Linux sandbox. A profile enters the allowlist only
    after all tests in task 8 pass in CI for the exact CLI version. It otherwise
    remains disabled.
12. Document allowlist maintenance: every Codex CLI upgrade opens a security
    update task, reruns the full platform probe matrix, reviews changed flags
    and feature surfaces, and only then adds the new exact version. Automatic
    CLI updates may temporarily disable Beta by design.

Acceptance:

- the provider starts only for an allowlisted, tested CLI/platform pair;
- every missing invariant blocks startup;
- no user secret environment variables reach the child;
- authentication works only through the tested OS-keyring path;
- file/env authentication remains fail-closed;
- a denied probe cannot be overridden by consent.

### O4 — Versioned Codex Beta consent

Files:

- new `lib/ai/codex-beta-consent.ts`
- `lib/ai/bridge-config.ts`
- app persistence files
- unit tests

Tasks:

1. Define current disclosure and isolation-policy versions.
   Increment the isolation-policy version whenever sandbox flags, executable
   validation, authentication mode, environment policy, platform allowlist, or
   mandatory probes change.
2. Add pure `validateCodexBetaConsent(consent, capability)` logic.
3. Record acceptance only after the bridge reports its installed CLI version
   and a passing capability result.
4. Invalidate consent on CLI version/policy/disclosure mismatch.
5. Clear consent on “Reset connection”.
6. Do not clear it on ordinary disconnect.
7. Store no machine identifiers, credentials, prompts, or story content.
8. The browser is the sole persistence owner for consent. It sends the consent
   record in `session_start`; the bridge validates version/CLI/policy matching
   for that session and never persists a copy.

Acceptance:

- consent is requested once for an unchanged verified configuration;
- every defined invalidation condition requests it again;
- forged or malformed persisted consent is rejected;
- technical hardening failure always wins over valid consent.

### O5 — Connection and consent UX

Files:

- `components/ai-chat/ConnectionCard.tsx`
- `components/ai-chat/AiChatPanel.tsx`
- `lib/translations.ts` (both English and Ukrainian sections)
- component tests

Tasks:

1. Show three choices:
   - Claude Code;
   - OpenAI API — `Recommended`;
   - Codex CLI — `Beta`.
   Expand `ProviderChoice`, `PROVIDERS`, provider labels, and connected-provider
   parsing to include `openai`. Remove the current blanket Codex `unavailable`
   hardcode; availability comes from the authenticated runtime challenge.
2. OpenAI API instructions configure the key in the local bridge environment;
   never render an API-key input in the browser.
3. Codex setup first shows/copies the bridge command including
   `--enable-codex-beta`. The running bridge then returns the authenticated
   capability/version challenge; the browser cannot inspect local CLI state
   before the bridge is running.
   If keyring authentication is absent, show a platform-correct secure login
   command that selects `cli_auth_credentials_store = "keyring"`; never suggest
   copying `auth.json` or exporting a Codex/OpenAI token.
   `bridgeCommand()` and the source-repository command append
   `--enable-codex-beta` only for Codex.
4. Show the full disclosure modal with an unchecked checkbox only when consent
   is absent or stale.
5. Disable acceptance until the checkbox is checked and runtime hardening has
   passed.
6. Use this order: show command → start bridge → receive verified challenge →
   accept disclosure → reconnect with consent.
7. Connected Codex UI permanently shows `Codex CLI · Beta` plus a compact
   residual-risk notice and a link/action to review the disclosure.
8. Localize all structured failure reasons in English and Ukrainian.
9. Reuse the existing “Reset connection” action in `AiChatPanel`: extend it to
   clear `codexBetaConsent` there. Ordinary `handleDisconnect` preserves it.
10. Accessibility: modal focus management, labelled checkbox, keyboard
    operation, readable error association, and no color-only status.
11. Replace every `claude|codex` UI branch, including `session_started`
    handling and connected labels, with exhaustive `BridgeProvider` mapping.
12. Add all new setup, consent, recommended/Beta, provider mismatch, challenge,
    keyring, and failure-reason keys to both language sections in
    `lib/translations.ts`; raw provider/server English must never be the
    user-facing fallback.

The disclosure must accurately state that Codex CLI is a local coding agent and
that, despite isolation, residual local-data risk remains. Do not claim “your
story never leaves the computer”: Claude/OpenAI prompts are sent to their
providers, and Codex sends its prompt/context to OpenAI under the user's Codex
account.

OpenAI setup copy also states that API billing is separate, `store:false` avoids
creating stored Responses but does not replace OpenAI's API data-handling
policies, and key/model changes require a bridge restart.

Acceptance:

- the recommended provider is unambiguous;
- Codex cannot be started through UI without valid consent and capability;
- the full warning does not reappear on every unchanged session;
- the persistent Beta warning remains visible after connection.

### O6 — Server enforcement and handshake

Files:

- `tools/ai-bridge/src/server.ts`
- bridge protocol/client as required
- server/client tests

Tasks:

1. Treat UI consent as a product gate, not the only security boundary.
2. Require the Codex bridge process to be launched with an explicit
   `--enable-codex-beta` flag. Carry the parsed value into
   `BridgeServerOptions`; reject Codex provider creation when it is false even
   if the client submits apparently valid consent.
3. Change provider preflight/factory handling to an asynchronous handshake state
   machine. While preflight is pending, ordinary client messages are rejected;
   replacing/closing the socket cancels its pending handshake result.
   Codex capability probes are single-flight — concurrent `session_start`
   requests share one probe run — with a short-TTL cache keyed by executable
   fingerprint, CLI version, platform profile, and policy version, plus a
   per-connection preflight rate limit, so repeated `session_start` cannot
   spawn unbounded CLI probe processes. Give every probe an `AbortSignal` and a
   hard deadline. Closing one subscriber must not cancel a probe still awaited
   by another connection, but when the last subscriber leaves (or the server
   closes), terminate the underlying child process and clean its temporary
   data rather than merely ignoring its eventual result.
4. Extend the v3 handshake with `session_challenge`, capability version, CLI
   version, and policy versions without including secrets.
5. Put the client consent record in `session_start`. The server validates it
   against the current runtime capability and policy for that session, but does
   not store it. Clearing browser storage therefore removes consent, and consent
   is intentionally local to that browser profile/device.
6. Revalidate capability before provider creation and before session resume.
   A cached report is valid only for the same executable fingerprint, CLI
   version, platform profile, and policy version.
7. Keep protocol-version mismatch behavior explicit and covered for v2↔v3.
8. A forged client consent can satisfy only the disclosure check; it still
   cannot bypass the bridge launch flag, version allowlist, sanitized process,
   or OS hardening probes.

Acceptance:

- a modified browser cannot make an unsafe Codex process start;
- a stale client cannot connect to a newer policy without fresh consent;
- Claude and OpenAI flows are unaffected.

### O7 — End-to-end verification and release gate

Files:

- unit/integration tests
- `e2e/ai/browser.spec.ts`
- opt-in live provider smoke configuration
- `wiki/ai-chat-release-checklist.md`

Deterministic browser scenarios:

1. OpenAI recommended setup and successful pairing.
2. OpenAI tool call, final response, Stop, and conversation reset.
3. Missing/invalid OpenAI key with localized retryable UI.
4. First Codex selection → hardening check → unchecked disclosure.
5. Accept consent → connect → persistent Beta badge.
6. Reconnect with same versions → no full disclosure.
7. Disclosure/policy/CLI version change → consent required again.
8. Hardening failure with valid consent → blocked, no override.
9. Disconnect preserves consent; Reset clears it.
10. Existing Claude, image durability, undo, and story-isolation scenarios
    remain green.
11. Use a fake OpenAI HTTP handler that mimics Responses API text, streaming,
    tool-call, tool-output continuation, usage, retry, and error scenarios.
    Exercise the real `OpenAiProvider` against it; do not substitute the
    existing `DeterministicProvider` for provider-level tests.
12. Resume with stale Codex consent/policy is challenged before the old session
    is reattached.
13. Preferred provider differing from the actual bridge provider is displayed
    honestly.
14. Protocol tests cover malformed/oversized challenges and consent records.
15. Package-build tests verify the published bridge contains the OpenAI
    provider and no source/API-key material, and that `dist/cli.mjs` stays a
    self-contained bundle: Zod and the schema converter are bundled in, and
    the bridge package gains no runtime dependencies.
16. A challenge blocks reconnect until an explicit user action; it cannot cause
    a background reconnect storm.
17. v4 persisted bridge settings migrate to v5 without losing URL/token/disabled
    and without inventing Codex consent.
18. OpenAI appears correctly in `session_started`, connected status, provider
    selection, generated commands, and actual provider factory wiring.
19. Closing one of multiple waiters preserves a shared Codex preflight; closing
    the last waiter aborts the child process, and timeout/server shutdown do the
    same without caching a partial result.

Release evidence:

- normal CI uses fake OpenAI transport and fake Codex capability reports;
- opt-in live OpenAI smoke records provider/model/version/result, never key or
  story text;
- opt-in Codex smoke runs only on each allowlisted OS/CLI combination;
- Codex Beta is hidden or disabled on every unverified combination;
- security probe results are documented in the release checklist.

## 6. Dependency order

```text
O1
├── O2 ───────────────┐
└── O3 ── O4 ── O5 ──┼── O6 ── O7
                      ┘
```

Practical order:

1. O1 provider/config contracts.
2. O2 OpenAI API provider and O3 Codex capability work can proceed in
   parallel.
3. O4 consent validation after O3 fixes the capability shape.
4. O5 UI after O1 and O4.
5. O6 handshake/server enforcement after O3–O5.
6. O7 final regression and live-smoke evidence.

O2 may ship independently if Codex Beta remains disabled. O3–O6 must ship as
one security unit; do not release a partial consent-only Codex implementation.
O4 may begin against a frozen mock of the O3 capability contract, but it cannot
merge until that shape matches the implemented runtime report.

## 7. Explicitly out of scope

- Putting OpenAI, Claude, or other provider API keys in browser storage.
- Using ChatGPT subscription credentials as an API key.
- Codex Beta authentication through `auth.json`, `CODEX_API_KEY`,
  `CODEX_ACCESS_TOKEN`, or copied credentials.
- Allowing Codex Beta on unknown versions or unsupported operating systems.
- A “continue anyway” bypass for failed hardening.
- General shell/filesystem/MCP access for the story assistant.
- Remote/LAN bridge exposure, TLS pairing, or multi-user bridge sessions.
- Durable provider conversations across bridge restarts.
- Provider billing management beyond clear setup/cost disclosures.

## 8. Definition of done

1. OpenAI API is a supported recommended provider with model-tool allowlisting.
2. No provider secret is present in the browser bundle, persisted state,
   protocol messages, logs, or error details.
3. Codex CLI Beta is unavailable unless both runtime hardening and versioned
   user consent pass.
4. Consent is one-time for an unchanged configuration and automatically stale
   after every locked invalidation event.
5. Consent cannot override technical failure.
6. Codex Beta has visible persistent labeling and accurate privacy copy.
7. All provider memory/reset, Stop, permissions, image durability, undo, and
   story-isolation tests remain green.
8. Deterministic browser E2E passes.
9. Live OpenAI smoke passes.
10. Codex live smoke passes separately on every allowlisted OS/CLI pair, or the
    provider remains disabled on that pair.
11. Every provider tool input passes the same canonical runtime Zod validation
    before dispatch.
12. Codex creation and resume both pass authenticated asynchronous preflight,
    and Codex authentication uses only the tested OS keyring.

## 9. External review disposition

Applied in v1.1:

- corrected the false claim that an OpenAI SDK was already selected;
- selected native `fetch` and the existing bridge redaction pattern;
- fixed the v1 model fallback to `gpt-5.6` with a single env-overridable
  constant;
- specified bounded local `store:false` conversation history and reset;
- specified `AbortController` behavior across the full tool loop;
- added bounded retry/backoff, timeout, usage, and session-budget contracts;
- made the protocol v3 bump explicit;
- made `--enable-codex-beta` part of CLI config and server enforcement;
- clarified that browser consent is sent per handshake and never persisted by
  the bridge;
- added fake Responses API transport requirements;
- added consent timestamp validation, idempotent cleanup races, and allowlist
  maintenance.

Added in v1.2 after implementation-readiness audit:

- explicit two-phase authenticated `session_challenge` handshake;
- asynchronous provider preflight and resume revalidation;
- keyring-only Codex authentication, executable pinning/change detection, and
  a stated local trust boundary;
- canonical runtime Zod validation for every provider;
- OpenAI non-strict schema decision and disabled parallel tool calls;
- stateless reasoning/assistant-phase preservation and atomic-turn history
  compaction;
- partial-stream no-retry behavior, SSE boundary tests, and a provider round
  cap;
- honest provider-mismatch UI, API billing/data-retention copy, and concrete
  `.env`/README work.

Added in v1.3 after integration-surface review:

- explicit app-store persistence v4→v5 migration and fail-closed consent
  normalization;
- exhaustive replacement of two-provider UI/client/server wiring;
- per-tool Zod→JSON Schema serialization tests and runtime-only
  `.superRefine()` clarification;
- OpenAI bridge-image emit/function-output/ack coverage;
- provider-agnostic internal capability authorization;
- precise logical-abort scope for pending browser-side tools;
- concrete bilingual translation ownership and handshake payload-size tests.

Added in v1.4 after implementation-fact check (constants verified against the
codebase: persist version 4, protocol version 2, `MAX_MESSAGE_BYTES` 1 MB,
Zod ^4.2.1, dependency-free bridge package):

- `include: ["reasoning.encrypted_content"]` on every Responses request —
  without it, `store:false` reasoning items have no replayable content and
  resent function calls lose their required reasoning pairing;
- system prompt delivered through per-request `instructions`, exempt from
  history compaction, counted in the request budget;
- structured self-correction feedback for invalid model-generated tool
  arguments instead of failing the turn;
- server-side probe single-flight, short-TTL capability cache, and
  per-connection preflight rate limit (the server-side counterpart of the
  client reconnect-storm rule);
- whole-store v4→v5 migration identity fixture, not only bridge-settings
  fixtures;
- bridge bundle self-containment assertion in package-build tests.

Corrected and added in v1.5 after checking current official Responses guidance
and the concrete runtime boundary:

- corrected the v1.4 claim that `reasoning.encrypted_content` must be requested
  through `include`; stateless responses now return it by default and the
  include value is legacy-compatible but optional;
- required atomic rejection of a completed response whose replay-required
  reasoning item nevertheless lacks encrypted content;
- required `BridgeToolRuntime` to dispatch Zod's `parsed.data`, not the raw
  model object;
- specified standard JSON string encoding and UTF-8 byte limits for
  `function_call_output`;
- made Codex preflight cancellation resource-safe with shared-waiter semantics,
  deadlines, child termination, and cleanup.

Not applied:

- **macOS/Linux-only Beta by assumption.** Current Codex documentation includes
  native Windows and WSL2 sandbox modes. The allowlist is therefore determined
  by identical automated isolation tests for each exact platform/CLI profile.
  No profile, including Windows, is enabled merely because a sandbox feature
  exists.
- **show token usage in the startup summary.** Usage does not exist at startup.
  It belongs in per-request privacy-safe diagnostics; exact monetary cost stays
  out of scope until pricing data has an explicit versioned source.

## 10. Post-implementation corrective plan (v1.6)

This section supersedes any claim that the whole plan is release-complete. A
2026-07-18 implementation audit confirmed the stream-cleanup defect reported
after v1.5 and found additional unimplemented O2 and Codex contracts. The
current implementation is a safe OpenAI/Claude release candidate only after
R0-R2 below. Codex remains fail-closed until R3 ships as one security unit.

### Verified baseline

- TypeScript typecheck passes.
- The complete deterministic suite passes: 163 files / 1248 tests.
- The OpenAI provider has 27 focused tests and the standalone package test
  passes on the current Windows environment.
- `send()` now closes its suspended inner response generator in `finally`, so
  breaking the outer iterator releases the HTTP response reader.
- `abortableDelay()` now removes its abort listener after a successful delay.
- These fixes are present only in the dirty working tree and are not release
  evidence until committed with the bridge changes.

### R0 - Runtime correctness blockers

Files:

- `tools/ai-bridge/src/openai-provider.ts`
- `tools/ai-bridge/src/provider.ts`
- `tools/ai-bridge/src/server.ts`
- `__tests__/unit/ai-bridge-openai-provider.test.ts`
- `__tests__/unit/ai-bridge-server.test.ts`

Tasks:

1. Retain the inner-generator `return()` cleanup and the successful-delay
   listener cleanup. Make `abortableDelay()` reject immediately when passed an
   already-aborted signal; this closes the abort race between cancelling the
   first retry response body and installing the delay listener.
2. Race every pending `BridgeToolRuntime.call()` against the turn abort signal.
   User Stop and the server turn deadline must finish the provider turn
   promptly even when an app confirmation or image tool remains pending. Do
   not append a late tool result, issue another Responses request, or mutate
   provider history. Observe the losing promise so a later rejection cannot
   become unhandled. Physical cancellation of an already-dispatched browser
   tool remains out of scope.
3. Enforce request budgets before every Responses call, including
   `instructions`, tools, committed history, and the current incomplete turn.
   Enforce item and UTF-8 byte limits again before committing a completed turn.
   A single turn that cannot fit must fail atomically and leave prior history
   unchanged; compaction may remove only whole older turns.
4. Add a bounded `max_output_tokens` request value. Do not rely on the 12 MB SSE
   transport cap as a conversation-memory cap.
5. Treat a completed response with a missing/non-array `output`, invalid
   terminal status, or malformed non-sentinel SSE data as a malformed provider
   response. It must not be accepted as an empty successful answer.
6. Handle `response.refusal.delta` and terminal refusal content explicitly.
   Show available refusal text with stop reason `refusal`; if no safe text is
   present, return a structured `OPENAI_REFUSAL` reason. Never produce a blank
   successful assistant turn.
7. Measure per-event limits in actual UTF-8 bytes. The total stream byte cap
   remains a separate outer bound.

Required regression tests:

- consumer break releases the response stream;
- an already-aborted retry delay rejects immediately and performs no retry;
- Stop during a never-resolving app tool returns promptly, ignores a late
  resolve/reject, sends no continuation request, and leaves history unchanged;
- server turn timeout has the same prompt completion property;
- over-budget current turn, over-budget single completed turn, and whole-turn
  history compaction;
- missing output, malformed SSE JSON, invalid completion status, refusal with
  text, and refusal without text;
- multibyte event data is limited by UTF-8 bytes rather than UTF-16 length.

### R1 - Structured failures, timeout, and privacy-safe diagnostics

Files:

- `tools/ai-bridge/src/provider.ts`
- `tools/ai-bridge/src/openai-provider.ts`
- `tools/ai-bridge/src/server.ts`
- `components/ai-chat/AiChatPanel.tsx`
- `lib/translations.ts`
- provider/server/UI tests

Tasks:

1. Add a typed provider failure carrying a closed safe reason. Preserve that
   reason through the server envelope instead of collapsing every OpenAI
   failure to `details.reason = PROVIDER_ERROR`.
2. Distinguish user interruption from request/turn timeout. Map authentication,
   authorization, rate limit, model unavailable, timeout, incomplete,
   malformed, refusal, response-too-large, and round-limit failures without
   forwarding API response bodies or credentials.
3. Localize the actionable runtime reasons in English and Ukrainian. Keep an
   unknown-reason fallback.
4. Read `response.id` and `response.usage` from the terminal response and emit
   privacy-safe diagnostics containing only model, request id, duration, and
   input/output/total token counts. Never log prompt, story data, tool output,
   API key, or a guessed currency cost.
5. Add the planned optional bridge-side session token budget and reset its
   counter on `conversation_reset`. Exhaustion is a structured failure and
   must not corrupt history.

Required tests:

- exact safe reason mapping for each HTTP/stream/timeout class;
- user Stop is not reported as timeout;
- diagnostic fields and session-budget reset/exhaustion;
- adversarial response body/key text cannot appear in logs, envelopes, or UI;
- UI localization for known reasons and generic fallback for unknown reasons.

### R2 - Package portability and live release evidence

Files:

- `__tests__/unit/ai-bridge-package.test.ts`
- bridge smoke-test script/configuration
- `tools/ai-bridge/README.md`
- `wiki/ai-chat-release-checklist.md`

Tasks:

1. Remove the package test's dependency on whichever `tar` binary appears
   first in `PATH`. Install the locally produced tarball into the temporary
   sandbox through the already-used package-manager toolchain, then execute the
   installed binary. The test must work with Windows bsdtar and with Git Bash
   GNU tar ahead of it.
2. Add an explicit opt-in live OpenAI smoke test guarded by an environment
   flag and `OPENAI_API_KEY`. It must exercise one text response and one benign
   model-tool round through the real provider, record only provider/model/
   protocol/result metadata, and never print the key, prompt, or story data.
3. Record the live API date, model, bridge version, and pass/fail result in the
   release checklist. Deterministic CI remains network-free.
4. Re-run typecheck, the focused provider/server/package tests, the full suite,
   bridge bundle build, `--version`, and `git diff --check`.

### R3 - Codex Beta remains a separate security unit

Current state is safe because `getCodexHardeningCapability()` always reports
unsupported and no Codex process can start. It is not a completed Codex Beta
implementation.

Tasks before enabling Codex anywhere:

1. While hardening is unsupported, render Codex as unavailable/disabled in the
   connection UI instead of offering a command that can only end in a
   challenge. Keep the server gate fail-closed.
2. Replace the server's loose `Record` consent presence check with the shared
   version/CLI/policy validator before any capability can return supported.
3. Implement O3-O6 completely: allowlisted executable and CLI version,
   keyring-only authentication, isolated workspace and environment, verified
   sandbox probes, asynchronous single-flight preflight with waiter cleanup,
   TTL cache and rate limit, versioned consent UI, invalidation, resume
   revalidation, and deterministic browser E2E.
4. Do not merge a capability flip, consent-only UI, or a `continue anyway`
   bypass independently. Unknown platform/CLI profiles stay disabled.

### R4 - Change isolation and merge order

The working tree also contains unrelated editor/showcase work. Preserve it and
do not include it in bridge commits.

Implementation order:

1. R0 as one provider/server correctness change.
2. R1 after the failure shape is frozen in R0.
3. R2 after R0-R1 are green.
4. Release OpenAI API + Claude only after the opt-in live OpenAI smoke passes.
5. R3 later as one independently reviewed security unit; until then Codex is
   visibly unavailable and technically fail-closed.

Release gate for the OpenAI API path: R0-R2 complete, deterministic suite and
package tests green on supported platforms, bridge bundle self-contained, and
live OpenAI smoke evidence recorded. Release gate for Codex: all of R3 plus the
original Codex Definition of Done; green OpenAI tests do not satisfy it.
