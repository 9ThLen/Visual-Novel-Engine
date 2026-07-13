# Local AI Bridge

Runs Claude Code or Codex CLI as a separate WebSocket process bound only to `127.0.0.1`.

## Start

Install and authenticate Claude Code CLI (`claude auth login`), then run:

```sh
pnpm ai-bridge
```

For ChatGPT through Codex CLI, authenticate once with `codex login`, then start:

```powershell
$env:AI_BRIDGE_PROVIDER='codex'; pnpm ai-bridge
```

The bridge prints one copyable `EXPO_PUBLIC_AI_BRIDGE_TOKEN=...` line. Pass that value to Expo before starting the web app, or paste it into the app's bridge-token field. The port defaults to `8787`; override it with `AI_BRIDGE_PORT`. Extra trusted origins may be supplied as a comma-separated `AI_BRIDGE_ALLOWED_ORIGINS` value.

## Security and limits

The server accepts only loopback connections, checks browser Origin, requires its random startup token as the first frame, rejects messages over 1 MB, and exposes only four app-proxied story tools. Claude receives only those tools. Codex runs in its read-only sandbox and is explicitly instructed to use only the app tools; unlike the Claude SDK path, Codex CLI still owns its built-in read-only inspection capabilities. A process supports one live agent session, a turn lasts at most 120 seconds, and at most 15 app tool calls are allowed per turn.

## Troubleshooting

- `Claude Code CLI is missing or not authenticated`: install Claude Code and run `claude auth login`.
- `Codex CLI is missing or unavailable`: install Codex CLI and run `codex login`.
- `UNAUTHORIZED`: restart the app with the token printed by the current bridge process.
- Origin rejected: use Expo web on port 8081 or explicitly add the exact origin to `AI_BRIDGE_ALLOWED_ORIGINS`.
- `PROVIDER_UNAVAILABLE`: finish/interrupt the active turn or stop the other client session.
