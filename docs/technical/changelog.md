# Changelog

## 2026-10-18 — The assistant sees the author's place; an agent of your own

Plan: `docs/technical/ai-editor-context-and-mcp-plan.md` (v1.19).

- **The assistant is told where the author is.** A message carries what the
  author selected and the block they have open, as a snapshot taken on send:
  the open document is saved first, and the selection is addressed to the
  steps it covers, each saying how sure the address is (`exact`, `quote`,
  `ambiguous`, `none`). The composer shows what goes
  with the message and lets the author leave it out. `get_editor_context`
  reads the same snapshot, or the editor as it is now (`mode: "live"`).
- **A proposal has a life of its own.** It waits up to ten minutes for the
  author, the bridge can withdraw it, a change on its way to the store is
  stopped if its call ended meanwhile, and the open editor shows a written
  change at once. A card on screen comes back after a reload of the page.
- **The session belongs to the editor, not to the AI panel.** Switching the
  rail's tabs or opening a scene on top keeps one connection and one card.
- **MCP.** `pnpm ai-bridge --mcp` offers the editor to an agent the author
  runs — Claude Code, Codex, anything that speaks Streamable HTTP — at `/mcp`,
  with a token of its own. It reads the story the editor has open and
  proposes changes; it writes nothing. `--provider none --mcp` runs a bridge
  for such an agent alone, with no chat and no key.
- **The author decides what the agent may do.** AI settings, "External
  agent": off (the default), read, or read and propose. Its proposals are
  always asked about and say whose they are; turning access down withdraws
  one that is on screen. «Save and hand to agent» gives it the selection, and
  the connection card's «No chat» connects to a bridge without chat.
- Protocol v5: the editor and the bridge must be updated together.
- New: `pnpm test:ai-mcp-live`, one real MCP client against the real bridge
  (opt-in, uses the client's own account).

## 2026-09-18 — Claude by API key

- Added `anthropic`, a fifth bridge provider: Claude through the Anthropic
  Messages API, authenticated by a key rather than by a separately installed CLI.
  `tools/ai-bridge/src/anthropic-provider.ts` streams it, replays thinking blocks
  unchanged across tool rounds, and carries the same limits, retries and failure
  taxonomy as the OpenAI and Gemini providers.
- The installed studio can now configure it: `KEYED_AI_PROVIDERS` in
  `src/lib/ai/providers.ts` is the one list the AI panel, `--save-key` and
  `bridge.rs` all read, and a test pins the Rust copy against it. An author with
  one `.exe` and a key reaches Claude without a terminal.
- `claude` still means Claude Code and still needs that CLI; the two are separate
  providers with separate cards.
- New: `pnpm test:ai-anthropic-live` (billable, opt-in) and its release gate.
- Added `.github/workflows/studio-desktop.yml`: the studio installer built on a
  Windows runner and uploaded as an artifact, so producing the `.exe` no longer
  needs a local Rust and MSVC toolchain. Windows only, because the bridge
  package it carries is.

## 2026-07-02 - Stabilization Cleanup

- Removed dead UI/reference files: `ReaderTransitions`, `SplashScreen`, `WebTopBar`, and `ShortcutHint`.
- Removed `hooks/use-story-state.ts`; active code uses `useAppStore()` directly.
- Added `shouldLogDevDiagnostics()` for dev-only logs that should stay quiet under Vitest.
- Updated active wiki references after removing stale migration pages.

## 2026-06-15 — GSD Fix Round

> Note: `hooks/use-story-state.ts` referenced in the migrations below was later removed during the 2026-07-02 stabilization cleanup (see `final-migration-audit.md`). Active code now calls `useAppStore()` directly.

### Hardcoded Colors Fixed
- `src/components/editor/PreviewScreen.tsx:237` — replaced `#fff` → `colors.surface` (flash effect)
- `src/components/reader/ReaderDisplay.tsx:233` — replaced `#ffffff` → `colors.surface` (flash effect)
- `src/components/reader/ReaderDisplay.tsx:255` — replaced `#ffffff` → `colors.foreground` (cursor)
- `src/components/editor/PreviewScreen.tsx:238` — replaced `rgba(0,0,0,0.32)` → `withAlpha(colors.foreground, 0.32)` (vignette)
- `src/components/reader/ReaderDisplay.tsx:238` — replaced `rgba(0,0,0,0.32)` → `withAlpha(colors.foreground, 0.32)` (vignette)

### Layer Boundary Violations Fixed (6 files)
- `src/lib/story-hooks.ts` — extracted `useStoryState()`/`useStoryActions()` → `hooks/use-story-state.ts`
- `src/lib/audio-library.ts` — extracted store access → `src/stores/audio-library-actions.ts`
- `src/lib/media-library-service.ts` — extracted store access → `src/stores/media-library-actions.ts`
- `lib/character-library.ts` — converted to pure functions (store access via parameters)
- `lib/i18n.ts` — moved `useI18n()` → `src/hooks/use-i18n.ts`
- `src/lib/theme-provider.tsx` — documented as acceptable exception (React component .tsx)

### Import Migrations
- `src/hooks/useAutoSave.ts` — migrated from `lib/types.ts` → domain modules (`@/lib/engine/types`, `@/lib/story-domain`)
- `src/hooks/useReaderAudio.ts` — migrated `useFocusEffect` from `@react-navigation/native` → `expo-router`
- 8 files migrated from `@/lib/story-hooks` → `@/hooks/use-story-state`
- 3 files migrated from `@/lib/media-library-service` → `@/stores/media-library-actions`

### Tests
- Created `tests/unit/lib/auth.test.ts` — unit tests for `isValidUser()`, `generateOAuthState()`
- Note: Test runner blocked by esbuild version mismatch (0.21.5 vs 0.28.0) — infrastructure issue, not code

### Documentation
- Updated `docs/technical/hooks-reference.md` — added `useStoryState`, `useStoryActions`, `useI18n` sections
- Created `docs/technical/changelog.md`

### Not Touched (Plate Editor)
- `src/lib/vn-plate-editor/` — untouched (Plate editor in progress)
- `src/lib/document-editor/` — untouched (Plate editor in progress)
- `src/components/document-editor/` — untouched (Plate editor in progress)
- `components/editor/SceneComposer*.tsx` — untouched (uses document-editor)
- `lib/editor/story-manuscript*.ts` — untouched (uses document-editor)
