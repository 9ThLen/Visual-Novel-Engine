# Local AI Bridge

Runs Claude Code or Codex CLI as a separate WebSocket process bound only to `127.0.0.1`.

## Start

Install Claude Code, start it once, and complete its sign-in:

```sh
npm install -g @anthropic-ai/claude-code
claude
```

Then start the bridge:

```sh
pnpm ai-bridge
```

For Codex, install and authenticate the CLI, then select it explicitly:

```sh
npm install -g @openai/codex
codex --login
pnpm ai-bridge --provider codex
```

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
--provider <claude|codex>
--origin <origin>          Repeat for each allowed browser origin
--port <port>
--help
```

CLI options override environment values. `AI_BRIDGE_PROVIDER`, `AI_BRIDGE_ALLOWED_ORIGINS` (comma-separated), and `AI_BRIDGE_PORT` override defaults. Supplying one or more `--origin` values replaces the environment/default list instead of extending it. The default allowed origins are only `http://localhost:8081` and `http://127.0.0.1:8081`.

## Security and limits

The server binds only to `127.0.0.1`, accepts only exact `http`/`https` loopback browser origins (`localhost`, `127.0.0.1`, or `[::1]`), requires its random startup token as the first frame, and limits message sizes. Claude receives only model-exposed app tools. Codex runs in its read-only sandbox and is explicitly instructed to use only the app tools; unlike the Claude SDK path, Codex CLI still owns its built-in read-only inspection capabilities. A process supports one live agent session, a turn lasts at most 120 seconds, and at most 15 app tool calls are allowed per turn.

The bridge is local, but messages and required story context are still sent to the selected AI provider. The pairing token stays on this device.

## Troubleshooting

- `Claude Code CLI is missing or not authenticated`: run `claude` and complete sign-in.
- `Codex CLI is missing or unavailable`: run `codex --login`.
- `UNAUTHORIZED`: paste the fresh token printed by the current bridge process.
- Origin rejected: use Expo web on port 8081 or start the bridge with the exact loopback origin, for example `--origin http://localhost:8092`.
- `SESSION_ALREADY_ACTIVE`: close the other editor tab or continue there. One bridge process supports one live session.
- `PROVIDER_UNAVAILABLE`: finish or interrupt the active turn and retry.
