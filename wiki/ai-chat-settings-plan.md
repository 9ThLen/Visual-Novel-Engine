# AI assistant settings — design plan

Author: Claude, 2026-07-22. Verified against `HEAD` = `4cdd6698`.
Status: proposal, not implemented.

## 1. What exists today

| Surface | Evidence | Reality |
| --- | --- | --- |
| Gear button `⚙` | `components/ai-chat/AiChatPanel.tsx:743` | Unlabelled glyph. Toggles a 4-row permission strip that pushes the transcript down. |
| Permission strip | `components/ai-chat/AiPermissionSettings.tsx` | The only real setting in the module: 4 capabilities × 3 levels. |
| `⋯` connection menu | `AiChatPanel.tsx:749-761` | Visible **only while connected**. Duplicates the permission entry point. |
| Connection wizard | `ConnectionCard.tsx`, rendered at `AiChatPanel.tsx:764` | Rendered **only while not connected**. Once connected, provider/URL/token become unreachable. |
| Global settings screen | `app/settings.tsx:199-304` | Six sections — language, audio, text, playback, cloud, about. Zero AI. |
| Model, budget, image defaults | `tools/ai-bridge/src/main.ts:77-82`, `image-tools.ts:8-12` | Live in bridge env vars (`OPENAI_CHAT_MODEL`, `OPENAI_SESSION_TOKEN_BUDGET`) and module constants. Invisible and unreachable from the app. |
| Usage / cost | `server.ts:213-215` sends `assistant_done.diagnostics`; `ProviderDiagnostics` carries `model`, `inputTokens`, `outputTokens`, `totalTokens`, `durationMs` | The panel receives it and throws it away (`AiChatPanel.tsx:336-344`). |

So the module has a settings *button* but no settings *surface*: one strip of four toggles, split across two menus, with everything expensive or interesting hidden in the bridge process.

## 2. Goals

1. One place that answers "what is this assistant allowed to do, what is it costing me, and how do I re-pair it" — reachable in one tap, in every connection state including broken ones.
2. Bring bridge-owned knobs (model, session budget, image defaults) into the UI **without** letting the browser widen a security boundary.
3. Surface the usage data the bridge already sends.
4. Keep the local-only security model intact: no provider credential is ever stored in, typed into, or transmitted by the app.

Non-goals: per-story settings profiles, cloud sync of AI preferences, prompt/system-prompt editing from the UI, any control over sandbox, origins, ports or provider binaries (those stay CLI-only by design).

## 3. Entry point and shell

Replace the toggle-strip with an in-panel **settings view**: the gear switches `AiChatPanel` between `view: 'chat'` and `view: 'settings'`, with a back arrow in the header. Reasons:

- The rail is 360 px wide (`DocumentRightRail.tsx:32`); a popover or RN `Modal` at that width is worse than a full-panel view.
- The settings view must render as a **sibling branch inside `AiChatPanel`**, not as a route or a separate mounted screen. The bridge `useEffect` (`AiChatPanel.tsx:285-462`) owns the `BridgeClient`; unmounting the panel closes the WebSocket session and drops any pending confirmation. Switching views must keep the session alive.
- The gear gets `accessibilityLabel` plus a visible label; it must **not** be gated on connection state — a broken connection is exactly when users go looking for settings.

The same component is hosted twice:

- `mode="session"` inside the panel — live status, usage, all sections.
- `mode="global"` inside a new `<Section title={t('settings.aiSection')}>` in `app/settings.tsx` — same component, no live session; connection section reads `aiBridgeSettings` and explains that pairing happens in the editor.

One component, two hosts. No control may exist in two places: the `⋯` menu is deleted, its Disconnect/Reset actions move into the Connection section.

## 4. Information architecture

Collapsible sections; the first two open by default.

1. **Status & connection** — state chip (demo / connecting / connected / error) + localized reason; provider; bridge URL; token (masked, with Re-pair); actions: Reconnect, Disconnect, Reset connection. Reuses the localized `aiChat.connection.reason.*` keys that already exist.
2. **Permissions** — the existing four capabilities, plus one line of explanation each. `changeset` and `image_generate` keep the forced `confirm` (`lib/ai/permissions.ts:43-47`); the UI must show *why* the `auto` option is missing rather than silently omitting it.
3. **Model & spending** — current model, session usage (turns, tokens, last turn duration), optional session token budget, and a warning at ≥80 %. Editable only when the bridge advertises it (§5).
4. **Images** — default size/quality/format and the cost estimate the bridge already computes (`image-tools.ts:50-55`). Read-only until S2.
5. **Story context** — what the assistant sees: active scene only vs whole story outline. Feeds `buildAiStoryContext`.
6. **Chat & data** — clear this story's transcript, clear all transcripts, delete pending images (`pendingImageRepository`), with confirmation for the destructive two.
7. **About & diagnostics** — bridge version, protocol version, provider, session id, last runtime error, "copy diagnostics" (token redacted). Also the honest platform message when `getAiPlatformSupport()` returns unsupported (`lib/ai/platform-support.ts`) instead of an empty panel.

## 5. Where state lives

Two existing homes, no third one:

- **Connection** stays in `aiBridgeSettings` (`stores/app-store-types.ts:22`, persisted and normalized in `lib/app-store-persistence.ts:275-291`).
- **Preferences** join `UserSettings` as `aiChat`, exactly mirroring how `aiPermissions` is handled:

```ts
// lib/ai/chat-settings.ts
export interface AiChatSettings {
  contextDepth: 'scene' | 'story';
  imageDefaults: { size: ImageSize; quality: ImageQuality; format: ImageFormat };
  model?: string;               // meaningful only if the bridge advertises it
  sessionTokenBudget?: number;  // undefined = bridge default, 0 = unlimited
  showDiagnostics: boolean;
}
export const defaultAiChatSettings: AiChatSettings;
export function normalizeAiChatSettings(value: unknown): AiChatSettings;
```

Wire `aiChat` into `normalizeUserSettings` (`lib/user-settings.ts:52`) and into `mergeLegacyUserSettings` (`:87-94`) the same way `aiPermissions` is, so legacy persisted records never erase it.

**Never stored in the app:** `OPENAI_API_KEY` or any provider credential. The Model section shows *where* to set it (bridge `.env`) and never offers a field for it. This restates the rule from the hardening plan §7 and belongs in a code comment on the settings component.

## 6. Bridge-owned settings: advertise, then allow

The browser must not be able to name an arbitrary model, budget, or image parameter that the bridge then passes to the API. The rule is: **the bridge advertises what is configurable; the UI renders only what was advertised; the server re-validates everything it receives.**

```ts
// lib/bridge-protocol.ts
export interface BridgeCapabilities {
  bridgeVersion: string;
  models?: { id: string; label?: string }[];
  defaultModel?: string;
  images?: { sizes: string[]; qualities: string[]; formats: string[]; model: string };
  configurable: ('model' | 'sessionBudget' | 'imageDefaults')[];
}
export interface SessionStartedPayload {
  sessionId: string; resumed: boolean; provider: BridgeProvider;
  capabilities?: BridgeCapabilities;
}
```

A provider that advertises `configurable: []` (Claude Code in v1) gets a section that says so — not a row of dead controls.

### Protocol delta v3 → v4

- `ClientMessageType` gains `'settings_update'` **and** the value must be added to the runtime array `CLIENT_MESSAGE_TYPES` (`bridge-protocol.ts:89`) — the union alone is not the gate; `isBridgeEnvelope` checks the array.
- `ServerMessageType` gains `'settings_ack'` (explicit, so the UI can show saved/failed) — same double edit at `:92`.
- Bump `BRIDGE_PROTOCOL_VERSION` 3 → 4 (`:1`). An older bridge then fails on the existing, already-localized `PROTOCOL_VERSION_MISMATCH` path instead of silently ignoring the new message.
- `maxBytesForEnvelope` needs no change: settings payloads are small and fall under the 1 MB default.
- Payload: `{ model?, sessionTokenBudget?, imageDefaults? }`. The server rejects unknown keys, values outside its own allowlist, and any attempt to carry credentials; reply is `settings_ack { applied, effective }` or `error VALIDATION_FAILED`.

### Model switching has a conversation cost

OpenAI reasoning items are model-bound — `assertReplayableReasoning` already raises `OPENAI_NON_REPLAYABLE_REASONING` (`openai-provider.ts:100`). Applying a new model must therefore call `resetConversation()` server-side and answer `settings_ack { conversationReset: true }`; the UI confirms first ("switching the model starts a new conversation") and posts a system message. The transcript in the app is kept; only provider history resets. This reuses the path that Clear chat already exercises.

## 7. Free win, available now

`assistant_done` already carries `diagnostics`. Accumulate it in the panel — `{ turns, totalTokens, lastModel, lastDurationMs }` — and render it in the settings header, plus one muted line under the composer when `showDiagnostics` is on. No protocol work, no bridge change. This is what makes the Model & spending section useful even before S2, and it makes the existing `OPENAI_SESSION_BUDGET_EXHAUSTED` error comprehensible instead of surprising.

## 8. Staging

### S1 — app-only, no protocol change
1. `lib/ai/chat-settings.ts` + wiring into `normalizeUserSettings` / `mergeLegacyUserSettings`.
2. `components/ai-chat/AiSettingsView.tsx` with sections 1, 2, 5, 6, 7 (3 and 4 read-only).
3. `AiChatPanel`: `view` state, labelled gear, back arrow; delete `showPermissions` and `showConnectionMenu`.
4. Usage accumulator from `assistant_done.diagnostics`.
5. `settings.aiSection` in `app/settings.tsx` hosting the same component in `mode="global"`.
6. Translations: new `aiChat.settings.*` keys in EN and UK.

Tests (vitest, `pnpm test`): unknown/garbage values fall back in `normalizeAiChatSettings`; opening and closing settings does **not** construct a second `BridgeClient` and does not clear a pending confirmation; permissions still round-trip through `updateSettings`; a fake `assistant_done` with diagnostics updates the usage meter; the platform-unsupported branch renders an explanation.

Acceptance: everything configurable today is reachable from one surface in every connection state, including connected and unauthorized.

### S2 — protocol v4 and bridge-owned knobs
Capability advertisement in `session_started`; `settings_update` / `settings_ack`; server-side allowlist; model switch resets provider conversation; image defaults come from session settings instead of the module constants in `image-tools.ts:8-12`.

Tests: unknown key → `VALIDATION_FAILED`; model outside the allowlist rejected; budget bounds enforced; ack round-trip; old bridge → `PROTOCOL_VERSION_MISMATCH`; image defaults actually reach `parseInput`.

### S3 — polish
Copy-diagnostics with token redaction; pending-image storage size and purge; the Codex Beta consent disclosure moves into the settings surface instead of living only in the connect flow.

## 9. Rules that must hold

- One control lives in exactly one place. The `⋯` menu goes away rather than staying as a shortcut.
- The settings button is never disabled by connection state.
- The WebSocket session survives the chat ↔ settings switch.
- The bridge is authoritative: the browser sends preferences, the server validates them. Nothing sent from the browser may influence provider selection, sandboxing, origins, ports, or credentials.
- No API key field in the app, in any section, ever.
