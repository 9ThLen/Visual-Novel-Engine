# Visual Novel Engine

Visual Novel Engine is an editor and player for interactive visual novels. Write a story, divide it into scenes, add characters, backgrounds, and music, and let readers shape what happens through their choices.

The work starts with text. You write a scene as a document, then add the actions around it: a character entering, a background changing, a sound playing, or a choice leading somewhere new. Preview the scene as you work, then play the whole story from the reader's perspective.

The basic experience runs locally without an account. Stories are saved in your browser, and the interface is available in English and Ukrainian.

## Start here

**[Install and run the app on Windows](docs/INSTALLATION.md)** — a complete walkthrough, from installing Git and Node.js to opening the editor. It includes exact PowerShell commands, checks after each stage, restarting, updating, and troubleshooting.

**[Create your first novel](docs/USER_GUIDE.md)** — build a short story with a character, a background, and two routes, test both choices, and save a portable backup.

**[Understand the settings](docs/SETTINGS.md)** — adjust sound and reading comfort, understand local storage, and find the optional cloud and AI setup guides.

The installation guide covers running from source: a local server runs on your computer and you work in a browser. It requires Node.js 24 or newer and pnpm 10.23.0. You do not need Android tools or service credentials for this workflow.

## What you can create

The scene editor brings narration and character dialogue together with visual and audio actions. You can start with plain text and add presentation as the story takes shape.

| Capability | How it helps your story |
| --- | --- |
| Stories and scenes | Organize projects and write scenes as readable documents. |
| Narration and character dialogue | Move between descriptive passages and conversations. |
| Choices and scene destinations | Give readers different paths through the story. |
| Variables and conditions | Remember decisions and make later options depend on them. |
| Backgrounds and character sprites | Set the location and show the cast. |
| Music, voice audio, and sound effects | Build atmosphere and support the action. |
| Effects, transitions, and camera actions | Control the presentation of important moments. |
| Interactive objects | Add interaction with elements in a scene. |
| Scene preview and full-story playback | Check the current scene and test the reader's journey. |
| Import, export, and full backups | Preserve your work and move it between installations. |
| Versioned releases | Freeze a story version for distribution. |
| Optional AI assistance and cloud backup | Connect additional services when you want them. |

The [user guide](docs/USER_GUIDE.md) introduces the workflow through a small example. The [action reference](wiki/block-types-reference.md) describes individual action types and their fields.

## Make reading comfortable

Settings let you choose the interface language and adjust music, voice, and effects separately. You can change how quickly text appears, resize dialogue text, and adjust the reader's font scale and line spacing.

Auto-play, parallax, and background video have their own controls. The [settings guide](docs/SETTINGS.md) explains each option. AI provider configuration is covered separately in the [AI bridge guide](tools/ai-bridge/README.md).

## Keep your work safe

Local stories belong to the browser profile and address where you created them. They do not automatically appear in another browser or on another computer. Clearing site data can remove them, and private browsing may discard them when the session ends.

Autosave helps you continue between sessions. For a portable copy, create a **full backup** from the story's project page: it includes the story and its media. A JSON-only export contains the story structure without images and audio. Keep full backups before updates or major rewrites, and use one editing tab at a time because concurrent scene edits cannot be merged safely.

See [saving and restoring a copy](docs/USER_GUIDE.md#7-save-a-portable-copy) for the workflow.

## Share a finished story

A release freezes one version of your story so you can continue editing the draft without changing that released version. Follow [Releasing a story](wiki/releases.md) to prepare a standalone web bundle.

[Desktop packaging](wiki/releases-desktop.md) and [Android packaging](wiki/releases-android.md) have separate requirements. Creating a browser story does not require installing their build tools.

The studio itself can also be [installed as a desktop application](wiki/studio-desktop.md), which removes the need for a checkout, a terminal and a development server.

## Project status and support

Visual Novel Engine is under active development. The documented acceptance scope covers the PC browser editor, browser reader, web bundle, and locally built Windows shell. The Android EAS path is implemented, but its paid-build and real-device acceptance are still pending. Optional integrations require their own configuration.

If something goes wrong during setup, start with [installation troubleshooting](docs/INSTALLATION.md#troubleshooting). For a reproducible problem, [open an issue](https://github.com/9ThLen/Visual-Novel-Engine/issues) with the steps, expected result, actual result, and relevant error messages. The [manual testing guide](docs/MANUAL_TESTING.md) includes a bug-report template.

## For contributors

The app uses Expo, React Native Web, TypeScript, Zustand, NativeWind, and Plate. The active scene editor is in `components/editor/plate/`; canonical scene data uses `SceneRecord + TimelineStep`.

From an installed checkout, use:

```powershell
pnpm.cmd dev:web  # Start the browser app
pnpm.cmd check    # Check TypeScript
pnpm.cmd test     # Run unit tests
pnpm.cmd lint     # Run lint checks
```

Further reading:

- [Documentation index](wiki/index.md)
- [Architecture reference](wiki/architecture-reference.md)
- [Testing guide](wiki/testing-guide.md)
- [Project changelog](wiki/changelog.md)
- [Product principles](PRODUCT.md)
- [Design system](DESIGN_SYSTEM.md)
- [Optional integration variables](.env.example)
