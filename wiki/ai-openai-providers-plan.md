# OpenAI providers implementation plan

Version: 1.0  
Date: 2026-07-16  
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
- The OpenAI model receives only the tools in `MODEL_BRIDGE_TOOLS`.
- Tool execution remains app-side and keeps the existing permission,
  confirmation, validation, snapshot, and undo contracts.
- Chat use and image use may share the same bridge-side key, but their provider
  errors and cost disclosures remain separate.
- The default model is bridge-side configuration (`OPENAI_CHAT_MODEL`), not a
  browser setting. A tested default must be selected during implementation
  from the currently supported Responses API models.

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

`session_started` continues to report the actual provider. Add provider
capability/status data only if the existing connection error/details channel
cannot carry:

- provider availability;
- CLI version;
- hardening failure reason;
- consent required/stale reason;
- OpenAI API authentication/configuration failure.

Prefer structured reason codes:

- `OPENAI_API_KEY_MISSING`
- `OPENAI_API_AUTH_FAILED`
- `OPENAI_MODEL_UNAVAILABLE`
- `CODEX_BETA_CONSENT_REQUIRED`
- `CODEX_BETA_CONSENT_STALE`
- `CODEX_CLI_VERSION_UNSUPPORTED`
- `CODEX_HARDENING_UNSUPPORTED`
- `CODEX_HARDENING_CHECK_FAILED`

Only bump `BRIDGE_PROTOCOL_VERSION` if the wire shape or closed unions become
incompatible. A provider-union-only compile-time change does not justify a
protocol bump by itself when older peers already treat provider as unknown.

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

## 5. Implementation packages

### O1 — Provider contracts and normalized configuration

Files:

- `lib/bridge-protocol.ts`
- `lib/ai/bridge-config.ts`
- `stores/app-store-initial-state.ts`
- `lib/app-store-persistence.ts`
- `tools/ai-bridge/src/cli-options.ts`
- relevant translations and tests

Tasks:

1. Add the `openai` provider to shared and CLI unions.
2. Add normalized `preferredProvider` and `codexBetaConsent`.
3. Preserve legacy hydration behavior and reject malformed consent objects.
4. Keep secrets out of persisted app state and serialized diagnostics.
5. Update help text and provider-specific startup diagnostics.

Acceptance:

- old persisted state hydrates without losing settings;
- malformed/stale consent is treated as absent;
- no browser bundle or persisted fixture contains `OPENAI_API_KEY`;
- CLI accepts exactly `claude|openai|codex`.

### O2 — OpenAI Responses API provider

Files:

- new `tools/ai-bridge/src/openai-provider.ts`
- `tools/ai-bridge/src/provider.ts`
- `tools/ai-bridge/src/main.ts`
- bridge package/build configuration
- provider tests

Tasks:

1. Implement `AgentProvider` using the official OpenAI SDK already selected for
   the bridge, or the platform `fetch` API if that avoids a new dependency
   without duplicating protocol machinery.
2. Convert only `MODEL_BRIDGE_TOOLS` to OpenAI function tools.
3. Keep tool calls in the existing bridge loop and return structured tool
   results through the same error normalization.
4. Stream text as `AgentEvent`; support `abort()`.
5. Maintain conversation state for the active bridge session and implement
   `resetConversation()`.
6. Read `OPENAI_API_KEY` and `OPENAI_CHAT_MODEL` only in the bridge process.
7. Map authentication, rate-limit, timeout, model, malformed-response, and
   abort failures to structured errors without exposing response bodies or
   credentials.
8. Ensure image capability authorization remains separate from chat turns.

Tests:

- exact model-tool parity;
- no bridge-internal tools are model-visible;
- multi-step tool call then final response;
- streaming and abort;
- reset creates fresh provider memory;
- missing/invalid key and rate-limit mapping;
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
3. Run compatibility probes with isolated `CODEX_HOME` and sanitized env.
4. Verify mandatory flags for both fresh and resumed invocation.
5. Set approval policy to deny/noninteractive and network to disabled using
   verified CLI configuration.
6. Verify disabled feature state without claiming that feature output alone is
   a complete security proof.
7. Add platform-specific sandbox smoke tests proving that the child cannot:
   - write outside its temporary workspace;
   - read a seeded file outside the allowed boundary;
   - access the network;
   - load user MCP/config/rules.
8. Return a structured failure report; never silently downgrade hardening.
9. Keep cleanup idempotent on success, abort, spawn failure, parse failure, and
   process termination.

Acceptance:

- the provider starts only for an allowlisted, tested CLI/platform pair;
- every missing invariant blocks startup;
- no user secret environment variables reach the child;
- a denied probe cannot be overridden by consent.

### O4 — Versioned Codex Beta consent

Files:

- new `lib/ai/codex-beta-consent.ts`
- `lib/ai/bridge-config.ts`
- app persistence files
- unit tests

Tasks:

1. Define current disclosure and isolation-policy versions.
2. Add pure `validateCodexBetaConsent(consent, capability)` logic.
3. Record acceptance only after the bridge reports its installed CLI version
   and a passing capability result.
4. Invalidate consent on CLI version/policy/disclosure mismatch.
5. Clear consent on “Reset connection”.
6. Do not clear it on ordinary disconnect.
7. Store no machine identifiers, credentials, prompts, or story content.

Acceptance:

- consent is requested once for an unchanged verified configuration;
- every defined invalidation condition requests it again;
- forged or malformed persisted consent is rejected;
- technical hardening failure always wins over valid consent.

### O5 — Connection and consent UX

Files:

- `components/ai-chat/ConnectionCard.tsx`
- `components/ai-chat/AiChatPanel.tsx`
- translations
- component tests

Tasks:

1. Show three choices:
   - Claude Code;
   - OpenAI API — `Recommended`;
   - Codex CLI — `Beta`.
2. OpenAI API instructions configure the key in the local bridge environment;
   never render an API-key input in the browser.
3. Codex selection first asks the bridge for capability/version status.
4. Show the full disclosure modal with an unchecked checkbox only when consent
   is absent or stale.
5. Disable acceptance until the checkbox is checked and runtime hardening has
   passed.
6. Persist consent, then show/copy the Codex bridge command.
7. Connected Codex UI permanently shows `Codex CLI · Beta` plus a compact
   residual-risk notice and a link/action to review the disclosure.
8. Localize all structured failure reasons in English and Ukrainian.
9. Reset clears consent; disconnect preserves it.
10. Accessibility: modal focus management, labelled checkbox, keyboard
    operation, readable error association, and no color-only status.

The disclosure must accurately state that Codex CLI is a local coding agent and
that, despite isolation, residual local-data risk remains. Do not claim “your
story never leaves the computer”: Claude/OpenAI prompts are sent to their
providers.

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
   `--enable-codex-beta` flag or equivalent bridge-side opt-in.
3. Include capability version, CLI version, and policy versions in the pairing
   status/handshake without including secrets.
4. Reject Codex sessions when client consent is absent/stale.
5. Revalidate capability before provider creation, not only during CLI startup.
6. Keep protocol-version mismatch behavior explicit if the handshake changes.

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

## 7. Explicitly out of scope

- Putting OpenAI, Claude, or other provider API keys in browser storage.
- Using ChatGPT subscription credentials as an API key.
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
