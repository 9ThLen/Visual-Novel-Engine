# Local AI Bridge

Runs Claude Code, OpenAI API, Google Gemini, or the fail-closed Codex CLI Beta behind a local WebSocket process bound only to `127.0.0.1`.

## Start

Install Claude Code, start it once, and complete its sign-in:

```sh
npm install -g @anthropic-ai/claude-code
claude
```

Then start the bridge from the source repository:

```sh
pnpm ai-bridge --provider claude
```

The recommended OpenAI route uses a normal API key in the bridge process. A
ChatGPT subscription is not an API key and API billing is separate. Put
`OPENAI_API_KEY` (and optionally `OPENAI_CHAT_MODEL`) in the bridge environment,
then restart the bridge after changing either value:

```sh
pnpm ai-bridge --provider openai
```

OpenAI and Gemini requests retry up to two times before streaming begins for
HTTP 429, 500, 502, 503, 504, and network failures. Retries use exponential
backoff with jitter and honor the full server-provided `Retry-After` delay until
the turn is aborted. The bridge never retries after receiving text, observing a
tool call, or reaching its provider-owned request timeout.

An OpenAI-to-Gemini fallback is available as an explicit, CLI-only opt-in:

```bash
pnpm ai-bridge --provider openai --fallback-provider gemini
```

This flag is consent to send the portable conversation transcript and current
attachments to Gemini if OpenAI fails before its first text fragment or tool
call. Both `OPENAI_API_KEY` and `GEMINI_API_KEY` are required. The router stays
on Gemini after switching. It never falls back after partial streaming, image
generation/editing, or any other tool call, so paid requests and app effects
cannot be duplicated automatically.
Provider-owned request timeouts also do not permanently switch the session to
Gemini; the user can retry the next turn on OpenAI.

The browser never receives or persists this key. Chat requests use stateless
Responses (`store:false`); OpenAI's API data-handling policy still applies.

For Google Gemini chat, put `GEMINI_API_KEY` (and optionally
`GEMINI_CHAT_MODEL`) in the project-root `.env`, then start:

```sh
pnpm ai-bridge --provider gemini
```

Gemini supports image, PDF, and text attachments. Image generation and editing
can use either Google Gemini or OpenAI Images, independently of the chat
provider. Select the backend explicitly, or leave it on deterministic `auto`:

```sh
pnpm ai-bridge --provider gemini --image-provider gemini
pnpm ai-bridge --provider claude --image-provider openai
```

`auto` uses Gemini for Gemini chat, OpenAI for OpenAI chat, and prefers OpenAI
for Claude/Codex when both image keys are configured. The startup summary and
the connected app settings always show the backend actually selected. `auto`
does not silently cross providers for Gemini/OpenAI chat: if that provider's
image key is missing but the other image key exists, the startup block prints
the explicit `--image-provider` command needed to opt into the configured
alternative.

For Gemini Images, `jpeg` and `png` are sent as explicit output MIME requests.
The Interactions API currently does not document WebP as a selectable image
response format, so `webp` is treated as a preference: the request leaves MIME
unspecified and the bridge preserves and displays the actual MIME returned by
Google. OpenAI Images continues to receive all three formats explicitly.

For Codex, install and authenticate the CLI, then select it explicitly:

```sh
npm install -g @openai/codex
codex login
pnpm ai-bridge --provider codex --enable-codex-beta
```

Codex is currently fail-closed: the supported CLI does not expose a
deterministic invocation-level way to remove every model-visible built-in data
tool. Starting the bridge with `--provider codex` therefore exits with
`CODEX_HARDENING_UNSUPPORTED`. Use Claude until a Codex CLI release provides a
testable zero-data-access tool boundary.

The bridge prints one pairing block containing the provider, WebSocket URL,
allowed browser origins, and the pairing token. Paste the token into the
editor's AI panel; editing the settings file is optional.

## The packaged bridge

`pnpm build:bridge-package` writes a folder an author can run on a Windows
machine that has never had Node, a checkout, or a terminal opened on it:

```
pnpm ai-bridge:build          # writes tools/ai-bridge/dist
pnpm build:bridge-package     # wraps it with a runtime and a launcher
```

The result is about 95 MB, nearly all of it the official `node.exe` the package
downloads from nodejs.org and checks against the release's published
`SHASUMS256.txt`. An interpreter nobody verified is not something to hand
someone and tell them to double-click. `--node <path>` ships one you supply
instead, unchecked, because at that point you chose it.

The author unzips it, runs `Start AI Bridge.cmd`, edits the settings file the
first run tells them about, runs it again, and pastes the URL and token into the
studio. `README.txt` in the folder says exactly that.

Two commands rather than one, for the reason the desktop channels give: the
package contains exactly what the bundler emitted, so there is one answer to
"what is in this package" — and re-running only the second of them packages a
stale bundle, which is the same trade every channel here makes.

What this is **not** is the sidecar. Nothing in the studio launches it; the
author starts it. Making the studio spawn it needs `tauri-plugin-shell` and a
widened capability file — see `tools/studio-shell/README.md`.

## Settings and token outside a checkout

The bridge reads settings from three layers, each one filling in only what the
layer above left unset:

1. CLI options;
2. the real environment, including a project-root `.env` in a checkout;
3. a `bridge.env` file in the bridge's own per-user directory.

That third layer is what an installed bridge uses, because it has no `.env` and
no meaningful working directory — starting it from a shortcut, from `C:\`, or
from Documents must not change which settings it finds. Set `VNE_BRIDGE_HOME`
to an absolute path to move the directory; otherwise it is:

| Platform | Directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\VisualNovelEngine\Bridge` |
| macOS | `~/Library/Application Support/VisualNovelEngine/Bridge` |
| Linux | `$XDG_CONFIG_HOME/visual-novel-engine/bridge` |

The **pairing token** lives in `token` in that same directory, apart from the
settings so it can be rotated on its own. It is issued on first run and reused
after that: a token minted per start would silently invalidate the pairing the
editor has saved, and the editor failing to connect after a reboot reads as a
broken product rather than as an expired secret.

A token file that is empty or malformed is an error, never a silent
replacement — see above for why. `--reset-token` issues a new one and exits. A
bridge that is already running keeps the old token in memory, so restart it:
that restart is what actually ends sessions authenticated with the old token.

On a machine with no settings file, the first run writes a commented template
and prints its path — "put your key in the settings file" is not an instruction
anyone can follow when there is no file and the directory is one they have never
opened. Every line in it is commented out, so it changes nothing until a person
edits it, and an existing file is never touched.

Both files are written `0o600`, which POSIX honours.

Windows ignores the mode. The files were left to inherit the ACL of the per-user
directory, on the assumption that it was owner-only — and checking that on a real
machine showed it was not: the inherited entries included a group the owner never
chose, so the file holding an author's API key was readable by more than the
author. The directory's ACL is now set explicitly with `icacls`, dropping the
inherited entries rather than adding to them, before anything is written into it.
A directory tightened afterwards leaves a window in which both files were
readable.

If that fails — no `icacls`, a denied permission — the bridge says so on startup
instead of implying a protection nobody applied.

The settings file matters at least as much as the token: the token is useful to
nothing but this bridge on this machine, while the settings file is where the
author's API key goes.

In the editor, open the AI tab and choose a visible provider card. The setup
panel shows the provider-specific instructions, a copyable bridge command, an
optional loopback WebSocket URL, and the pairing-token field. The
provider shown after connection comes from the bridge handshake, not from the
wizard selection.

The connected-state menu offers:

- **Disconnect**: ends the current bridge session but keeps the saved local URL
  and token for an explicit reconnect.
- **Reset connection**: ends the session, removes the saved resume ID, URL, and
  token, and disables the automatic environment fallback until the user
  connects again.
- **AI permissions**: controls which tool capabilities require confirmation,
  may run automatically, or are blocked.

Available CLI options:

```text
--provider <claude|openai|codex|gemini>
--fallback-provider <gemini>
--image-provider <auto|openai|gemini|none>
--enable-codex-beta       Required for Codex CLI Beta
--origin <origin>          Repeat for each allowed browser origin
--port <port>
--help
--version
```

`@visual-novel-engine/ai-bridge` is not currently published to npm. Do not use
the old `npx @visual-novel-engine/ai-bridge` examples. Build and inspect the
future publishable package with `pnpm ai-bridge:build` and `pnpm ai-bridge:pack`.

Before an OpenAI release, run the explicit, billable smoke test. It refuses to
run unless both the opt-in flag and API key are present and prints only
allowlisted diagnostics (never the key, prompt, story data, attachment
contents, or tool output):

```sh
RUN_OPENAI_LIVE_SMOKE=true OPENAI_API_KEY=... pnpm test:ai-openai-live
```

On PowerShell, set the two environment variables first, then run the command.

Before enabling Gemini image generation for a release, run its separate,
billable end-to-end smoke. It uses the production `generate_image` handler,
requests one low-cost 1K draft image, validates the returned MIME type, byte
size, and file signature, and prints no API key, prompt, or image contents:

```sh
RUN_GEMINI_IMAGE_LIVE_SMOKE=true GEMINI_API_KEY=... pnpm test:ai-gemini-image-live
```

On PowerShell, set `RUN_GEMINI_IMAGE_LIVE_SMOKE` and `GEMINI_API_KEY` first,
then run `pnpm test:ai-gemini-image-live`. The smoke requests WebP so its
allowlisted JSON output makes Gemini's actual returned MIME visible alongside
the model and byte count.

The smoke test covers text, one app-tool call, PNG/PDF/text attachments, an
attachment follow-up, conversation reset, and abort. Claude attachments remain
disabled by default until the equivalent opt-in smoke passes in the target
environment:

```sh
RUN_CLAUDE_LIVE_SMOKE=true pnpm test:ai-claude-live
```

Only after that command passes should the bridge be started with
`AI_BRIDGE_ENABLE_CLAUDE_ATTACHMENTS=true`.

CLI options override environment values. `AI_BRIDGE_PROVIDER`, `AI_BRIDGE_ALLOWED_ORIGINS` (comma-separated), and `AI_BRIDGE_PORT` override defaults. Supplying one or more `--origin` values replaces the environment/default list instead of extending it. The default allowed origins are only `http://localhost:8081` and `http://127.0.0.1:8081`.

## Security and limits

The server binds only to `127.0.0.1`, accepts only exact `http`/`https` loopback browser origins (`localhost`, `127.0.0.1`, or `[::1]`), requires its random startup token as the first frame, and limits message sizes. Claude receives only model-exposed app tools. Codex remains disabled while its CLI cannot prove an equivalent zero-data-access tool boundary. A process supports one live agent session, a turn lasts at most 120 seconds, and at most 15 app tool calls are allowed per turn.

The bridge is local, but messages and required story context are still sent to the selected AI provider. The pairing token stays on this device.

## Troubleshooting

- `Claude Code CLI is missing or not authenticated`: run `claude` and complete sign-in.
- `Codex CLI is missing or unavailable`: run `codex login`.
- `CODEX_HARDENING_UNSUPPORTED`: use Claude; this Codex CLI cannot be
  restricted to the VNE app-tool surface deterministically.
- `UNAUTHORIZED`: paste the fresh token printed by the current bridge process.
- `PROVIDER_MISMATCH`: use the provider detected by the editor, or start the selected provider on a different port.
- Origin rejected: use Expo web on port 8081 or start the bridge with the exact loopback origin, for example `--origin http://localhost:8092`.
- `SESSION_ALREADY_ACTIVE`: close the other editor tab or continue there. One bridge process supports one live session.
- `PROVIDER_UNAVAILABLE`: finish or interrupt the active turn and retry.
