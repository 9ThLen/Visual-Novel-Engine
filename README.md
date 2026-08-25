# Visual Novel Engine

![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react&logoColor=111827)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10.23-F69220?logo=pnpm&logoColor=white)
![Platform](https://img.shields.io/badge/current_platform-PC%20%7C%20Web-2563EB)
![Status](https://img.shields.io/badge/status-active_development-F59E0B)

Visual Novel Engine is a browser-based editor and player for creating interactive visual novels on a PC. It gives writers a focused place to write scenes, build branching dialogue, add characters and media, preview changes, and play the result from a reader's perspective.

> **Current testing scope:** authoring and testing happen on a PC in a desktop browser. Android tooling, emulators, and native builds are not required. Android is planned as a way for readers to experience a finished novel, not as part of the current local setup.

## Features

- Create and organize visual novel projects.
- Write scenes as readable document pages.
- Add narration, dialogue, choices, variables, and conditions.
- Use backgrounds, character sprites, audio, effects, transitions, camera actions, and interactive objects.
- Preview the active scene without leaving the editor.
- Play the complete story through the reader runtime.
- Save work locally in the browser and export story data.
- Optionally enable cloud backup and AI-assisted editing.

## Quick start on Windows

### Requirements

Install the following before continuing:

- [Git for Windows](https://git-scm.com/download/win)
- [Node.js LTS](https://nodejs.org/en/download), version 20.19 or newer
- Chrome, Edge, or Firefox

You do **not** need Android Studio, an Android emulator, Java, Supabase, a `.env` file, or any API keys for the standard local experience.

### 1. Download the project

Open PowerShell and run:

```powershell
git clone https://github.com/9ThLen/Visual-Novel-Engine.git
cd Visual-Novel-Engine
```

### 2. Install dependencies

```powershell
corepack pnpm install
```

Corepack may ask for permission to download the pnpm version declared by the project. Confirm the prompt if it appears.

### 3. Start the web app

```powershell
corepack pnpm dev:web
```

Open [http://localhost:8081](http://localhost:8081) if the browser does not open automatically.

Keep the PowerShell window running while you use the app. Press `Ctrl+C` in that window to stop the development server.

For a step-by-step guided setup, see the [Windows tester quick start](docs/TESTER_QUICK_START.md).

## Using the app

1. Open the home page and select **Studio**.
2. Open a bundled demo or create a new story.
3. Select **Edit novel** to write and organize scenes.
4. Add dialogue, choices, characters, media, and runtime actions.
5. Preview the active scene while editing.
6. Select **Play novel** to experience the story as a reader.
7. Reload the browser and confirm that your work is still available.

The interface supports English and Ukrainian. Visible button names follow the language selected in Settings.

## Starting the app again

After the first installation, you only need to open PowerShell in the project directory and start the server:

```powershell
cd C:\path\to\Visual-Novel-Engine
corepack pnpm dev:web
```

Do not run `git clone` again for an existing copy of the project.

## Updating the project

Stop the server with `Ctrl+C`, then run:

```powershell
git pull
corepack pnpm install
corepack pnpm dev:web
```

Stories are stored in the current browser profile rather than in Git. Export important work before a major update. Incognito or InPrivate windows may remove local data when they are closed.

## Troubleshooting

### `git`, `node`, or `corepack` is not recognized

Confirm that Git and Node.js LTS are installed. Close all PowerShell windows, open a new one, and check:

```powershell
git --version
node --version
corepack pnpm --version
```

If a command is still unavailable, restart Windows and try again.

### Port 8081 is already in use

Check whether the app is already running in another PowerShell window. Stop the old process with `Ctrl+C`, then run `corepack pnpm dev:web` again.

### The page does not open

Keep the server window open, check it for errors, and visit [http://localhost:8081](http://localhost:8081) manually. Use `Ctrl+Shift+R` to perform a hard refresh.

### The browser shows an old version

Stop the server and restart Expo with a clean cache:

```powershell
git pull
corepack pnpm install
corepack pnpm exec expo start --web --port 8081 --clear
```

### `pnpm install` fails

Save the first complete `ERR_PNPM` message, verify the Node.js version, and check the internet connection, VPN, proxy, or antivirus. Do not delete project files unless a developer asks you to.

## Local data and optional services

The default experience is local-first:

- no account is required;
- story data stays in the current browser profile;
- use one app tab at a time; concurrent tabs can overwrite each other's latest local changes;
- different browsers use separate local storage;
- clearing site data for `localhost` can remove locally stored stories.

The `.env.example` file documents optional integrations. Copy it to `.env` only when you intentionally configure Supabase cloud backup or an AI provider. Never place a Supabase `service_role` key in the client configuration, and never commit credentials.

For AI provider setup and local bridge pairing, see [`tools/ai-bridge/README.md`](tools/ai-bridge/README.md).

## Development commands

```powershell
# Start the web development server
corepack pnpm dev:web

# Type-check the project
corepack pnpm check

# Run unit tests
corepack pnpm test

# Run lint checks
corepack pnpm lint

# Run the deterministic AI browser suite
corepack pnpm test:ai-e2e
```

Native Android and iOS commands are intentionally outside the current testing workflow.

## Technology

- [Expo](https://expo.dev/) and Expo Router
- React Native and React Native Web
- TypeScript
- Zustand
- NativeWind
- Plate
- Vitest and Playwright

## Architecture overview

- `app/` — Expo Router screens.
- `components/editor/plate/` — the active scene editor.
- `components/editor/` — active preview, play, scene management, manuscript, and shared editor surfaces.
- `lib/engine/` — timeline execution, events, and condition evaluation.
- `stores/use-app-store.ts` — persisted Zustand application state.
- `lib/persistent-storage.ts` — platform-aware storage abstraction.
- `wiki/` — detailed project knowledge base.

Canonical scene data uses `SceneRecord + TimelineStep`. Legacy `Story`, `StoryScene`, and `Choice` types remain only at import, export, and migration boundaries.

## Documentation

- [`docs/TESTER_QUICK_START.md`](docs/TESTER_QUICK_START.md) — first installation and web launch on Windows.
- [`docs/MANUAL_TESTING.md`](docs/MANUAL_TESTING.md) — manual test scope, regression checklist, and bug-report template.
- [`wiki/index.md`](wiki/index.md) — documentation index.
- [`wiki/overview.md`](wiki/overview.md) — product and system overview.
- [`wiki/architecture-reference.md`](wiki/architecture-reference.md) — architecture reference.
- [`wiki/testing-guide.md`](wiki/testing-guide.md) — automated testing guide.
- [`wiki/publish-web.md`](wiki/publish-web.md) — export a finished story as a standalone web bundle.
- [`PRODUCT.md`](PRODUCT.md) — product purpose and design principles.
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — visual language, tokens, and theme rules.

## Project status

Visual Novel Engine is under active development. The current acceptance workflow covers the PC web editor and web reader. Cloud integrations and AI providers are optional, while Android remains a future distribution target for finished novels.
