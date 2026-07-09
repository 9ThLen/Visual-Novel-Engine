# Publishing a story as a playable web bundle

Export **one** story as a self-contained static web app that anyone can host on
GitHub Pages, itch.io, or any static file server. The reader opens directly into
the story — no editor or library UI is reachable.

## Usage

```bash
pnpm export:story -- --story <id-or-json-path> --out <dir>
```

Examples:

```bash
# By bundled story id (looked up in assets/*.json)
pnpm export:story -- --story demo-advanced-001 --out ./story-dist

# By path to an exported story JSON
pnpm export:story -- --story ./my-story.json --out ./story-dist
```

Then serve the output with any static host:

```bash
npx serve ./story-dist
```

### Options

| Flag           | Meaning                                                             |
| -------------- | ------------------------------------------------------------------- |
| `--story`      | Story id (matched against `assets/*.json`) or path to a story JSON. |
| `--out`        | Output directory for the published bundle (**required**).           |
| `--dist`       | Existing Expo web build to reuse (default `dist`).                   |
| `--build`      | Force a fresh `expo export --platform web` even if `dist` exists.    |
| `--skip-build` | Fail instead of building when no web build is present.              |

## How it works

The published bundle is the ordinary Expo web build plus a generated
`player-config.json` next to `index.html`:

1. The exporter reuses (or runs) `expo export --platform web`.
2. It copies that build to `--out`.
3. It writes `player-config.json` — the boot flag — containing the story JSON.

On load, the app fetches `player-config.json`. When present it seeds the story
into the store and routes straight to the reader
(`app/index.tsx` → `lib/player-mode.ts`). A route guard
(`components/PlayerModeRouteGuard.tsx`) bounces any navigation to a non-reader
route back to the story, so the editor stays unreachable (guarded, not deleted).

The story input may be either the canonical (`SceneRecord + TimelineStep`) or
the legacy `Story` shape — the app canonicalizes legacy stories at boot, exactly
as it does for the bundled demo stories.

## Assets

The exporter collects every asset the story references and verifies each one
before writing the bundle. If any reference is broken it fails loudly with the
full list. References are handled as follows:

- **Bundled** (`assets/…`) — shipped inside the web build. Must exist on disk.
- **Inline** (`data:` URIs) — self-contained; carried in `player-config.json`.
- **Remote** (`http(s)://…`) — fetched at runtime by the reader.

### Limitations

- Only assets that are **bundled**, **inline data URIs**, or **remote URLs** can
  be published. Device-local references (`file://`, `blob:`, `content://`,
  media-library paths) cannot be packaged by the Node script and are reported as
  broken — re-export the story from the app with its assets inlined first.
- Bundled `assets/…` paths only resolve at runtime if they are part of the app's
  compiled asset map (`lib/asset-resolver.ts`). This covers the demo stories'
  assets. Custom art should be added through the app's media library (which
  stores it as inlinable data) rather than as raw `assets/…` paths.
- Serve the bundle from the **root** of its host path. Sub-path hosting (e.g. a
  GitHub Pages project sub-directory) needs an Expo `baseUrl` build and is out of
  scope for this exporter.
