# `app-player/` — the player build's route root

Selected by the `expo-router` plugin's `root` option when the build runs with
`VNE_PROFILE=player` (see `app.config.js`). Expo Router crawls exactly one
directory, so with this root the studio's routes — `document-editor`,
`manuscript-editor`, `scene-manager`, `editor`, `story-home`, `theme-studio`,
`story-gallery`, `cloud-backup`, `tabs` — are not merely unreachable, they are
never required into the bundle.

The screens themselves stay in `app/`. They are shared with the studio build,
and duplicating six hundred lines of reader so that the player could own a copy
would guarantee the two drift. What the wrappers here decide is *which* screens
exist at all.

Run `pnpm check:player-bundle` after touching anything the reader imports: it
walks the module graph from this directory and fails if an authoring module
became reachable.
