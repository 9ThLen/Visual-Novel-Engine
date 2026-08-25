# Visual Novel Engine

Visual Novel Engine is a browser-based editor and player for creating interactive visual novels on a PC. Writers can build scenes, dialogue, choices, characters, backgrounds, audio, effects, and transitions, then play the result through the same runtime used by the reader.

The current testing workflow is **PC and web only**. Android tooling, emulators, and native builds are not required. Android is a future target for reading a finished novel, not part of the local setup described here.

## Main features

- Write a novel as an ordered set of scenes.
- Add dialogue, narration, branching choices, variables, and conditions.
- Manage characters, backgrounds, audio, effects, transitions, and camera actions.
- Preview scenes while editing and play the novel as a reader.
- Save work locally in the browser and export story data.
- Optionally enable cloud backup or connect an AI editing provider.

## Quick start on Windows

### Requirements

- Windows 10 or 11.
- [Git](https://git-scm.com/download/win).
- A current [Node.js LTS](https://nodejs.org/en/download) release. Expo SDK 54 requires Node.js 20.19 or newer.
- A current desktop browser such as Chrome, Edge, or Firefox.

Android Studio, an Android emulator, Java, and API keys are **not** required.

### Install and run

Open PowerShell and run:

```powershell
git clone https://github.com/9ThLen/Visual-Novel-Engine.git
cd Visual-Novel-Engine
corepack pnpm install
corepack pnpm dev:web
```

Open [http://localhost:8081](http://localhost:8081) if the browser does not open automatically. Keep PowerShell running while using the app. Press `Ctrl+C` in PowerShell to stop it.

For a fully guided setup, updates, and troubleshooting, see the [Windows tester quick start](docs/TESTER_QUICK_START.md).

## Basic workflow

1. Open the app and use **Studio** to enter the authoring area.
2. Open a demo story or create a new story.
3. Choose **Edit novel** to write and organize its scenes.
4. Add interactive blocks such as dialogue, choices, images, audio, and effects.
5. Preview the scene, then use **Play novel** to check the reader experience.
6. Reload the page and confirm that the browser retained the story.

The interface supports English and Ukrainian; button labels follow the language selected in Settings.

## Manual testing

Use [Manual testing](docs/MANUAL_TESTING.md) for the test scope, expected results, regression checklist, and bug-report template. It covers the PC web editor and web reader only.

## Optional configuration

The app runs local-first without a `.env` file. Story data is stored in the browser on the current PC.

Copy `.env.example` to `.env` only when you intentionally want to configure an optional integration:

- Supabase cloud backup;
- the local AI bridge;
- OpenAI, Claude, Codex, or Gemini provider access.

Never commit API keys or a Supabase `service_role` key. AI bridge details are documented in [`tools/ai-bridge/README.md`](tools/ai-bridge/README.md).

## Development commands

```powershell
# Start the web app
corepack pnpm dev:web

# Type-check, test, and lint
corepack pnpm check
corepack pnpm test
corepack pnpm lint

# Run the deterministic AI browser suite
corepack pnpm test:ai-e2e
```

Native Android and iOS commands are intentionally outside the current tester workflow.

## Project structure

- `app/` — Expo Router screens.
- `components/editor/plate/` — the active scene editor.
- `components/editor/` — active preview, play, scene-management, manuscript, and shared editor surfaces.
- `lib/engine/` — runtime execution and timeline event logic.
- `stores/use-app-store.ts` — persisted Zustand application state.
- `lib/persistent-storage.ts` — storage abstraction with web support.
- `wiki/` — architecture, engine, storage, testing, and publishing references.

Canonical scene data uses `SceneRecord + TimelineStep`. Legacy `Story`, `StoryScene`, and `Choice` shapes remain only at import, export, and migration boundaries.

## Documentation

- [Tester quick start](docs/TESTER_QUICK_START.md) — first installation and web launch on Windows.
- [Manual testing](docs/MANUAL_TESTING.md) — user-facing test scenarios and bug reports.
- [Project knowledge base](wiki/index.md) — technical documentation index.
- [Product principles](PRODUCT.md) — purpose, audience, and design direction.
- [Publishing a playable web story](wiki/publish-web.md) — export a finished story as a static web bundle.
- [Testing guide](wiki/testing-guide.md) — automated tests for developers.

## Current scope

The repository is under active development. For the current test cycle:

- authoring and testing happen on a PC in the browser;
- local browser storage is the default persistence layer;
- cloud backup and AI providers are optional;
- Android is considered a future reader platform for finished novels and is not part of setup or acceptance testing.
