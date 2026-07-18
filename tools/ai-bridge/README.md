# Local AI Bridge

Runs Claude Code, OpenAI API, or the fail-closed Codex CLI Beta behind a local WebSocket process bound only to `127.0.0.1`.

## Start

Install Claude Code, start it once, and complete its sign-in:

```sh
npm install -g @anthropic-ai/claude-code
claude
```

Then start the standalone bridge (the source repository and pnpm are not
required):

```sh
npx @visual-novel-engine/ai-bridge --provider claude
```

The recommended OpenAI route uses a normal API key in the bridge process. A
ChatGPT subscription is not an API key and API billing is separate. Put
`OPENAI_API_KEY` (and optionally `OPENAI_CHAT_MODEL`) in the bridge environment,
then restart the bridge after changing either value:

```sh
npx @visual-novel-engine/ai-bridge --provider openai
```

The browser never receives or persists this key. Chat requests use stateless
Responses (`store:false`); OpenAI's API data-handling policy still applies.

For Codex, install and authenticate the CLI, then select it explicitly:

```sh
npm install -g @openai/codex
codex login
npx @visual-novel-engine/ai-bridge --provider codex --enable-codex-beta
```

Codex is currently fail-closed: the supported CLI does not expose a
deterministic invocation-level way to remove every model-visible built-in data
tool. Starting the bridge with `--provider codex` therefore exits with
`CODEX_HARDENING_UNSUPPORTED`. Use Claude until a Codex CLI release provides a
testable zero-data-access tool boundary.

The bridge prints one pairing block containing the provider, WebSocket URL, allowed browser origins, and a random token. Paste the token into the editor's AI panel; editing `.env` is optional.

In the editor, open the AI tab and choose **Connect real AI**. The wizard shows
the install/sign-in commands, a copyable bridge command for the selected
provider, an optional loopback WebSocket URL, and the pairing-token field. The
provider shown after connection comes from the bridge handshake, not from the
wizard selection.

The connected-state menu offers:

- **Disconnect**: ends the current bridge session but keeps the saved local URL
  and token for an explicit reconnect.
- **Reset connection**: ends the session, removes the saved resume ID, URL, and
  token, and disables automatic `.env` fallback until the user connects again.
- **AI permissions**: controls which tool capabilities require confirmation,
  may run automatically, or are blocked.

Available CLI options:

```text
--provider <claude|openai|codex>
--enable-codex-beta       Required for Codex CLI Beta
--origin <origin>          Repeat for each allowed browser origin
--port <port>
--help
--version
```

Repository developers can keep using `pnpm ai-bridge`. Build and inspect the
publishable package with `pnpm ai-bridge:build` and `pnpm ai-bridge:pack`.

Before an OpenAI release, run the explicit, billable smoke test. It refuses to
run unless both the opt-in flag and API key are present and prints only
allowlisted diagnostics (never the key, prompt, story data, or tool output):

```sh
RUN_OPENAI_LIVE_SMOKE=true OPENAI_API_KEY=... pnpm test:ai-openai-live
```

On PowerShell, set the two environment variables first, then run the command.

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
- Origin rejected: use Expo web on port 8081 or start the bridge with the exact loopback origin, for example `--origin http://localhost:8092`.
- `SESSION_ALREADY_ACTIVE`: close the other editor tab or continue there. One bridge process supports one live session.
- `PROVIDER_UNAVAILABLE`: finish or interrupt the active turn and retry.
