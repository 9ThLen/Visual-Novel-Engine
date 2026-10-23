# Changelog

## 2026-10-23 — The comic renderer

PR 2.4a of `docs/plans/COMIC-STAGE-2-PLAN.md`: the HTML renderer the spike
chose, made to draw a real page plan. The reader does not use it yet (2.4b).

- **`ComicPlanView`** (`src/components/comic/`) draws a scene's page plan:
  backgrounds and sprites from the story's media and characters, captions,
  bubbles under the speaker's name and leaning to the side they stand on,
  and a choice at the end of the strip. It shows as many panels as the reader
  has opened and keeps the ones already drawn, so a new panel comes up alone
  and a rollback takes the last ones away.
- **The frame** (`src/lib/comic/comic-frame-*.ts`) is one HTML document in an
  iframe on the web and the desktop shell and in a WebView on Android. A
  panel grows with its words instead of cutting them off at a large text
  size; pages are cut from the panels' measured heights; pictures load only
  near the viewport. Words always go in as text. The frame may not fetch
  anything and uses the platform's fonts, which work offline and carry
  Cyrillic. It reports taps (also Space and Enter) and the option picked.
- **On Android** the WebView's own text zoom is pinned and the reader's font
  scale is handed to the frame; a renderer process the system kills is
  replaced with a new document, which asks for the strip again; a release
  build's bundled art is read from `file:///android_res/`.
- The spike's code (`/comic-spike`, `src/lib/comic/spike/`,
  `tools/comic-spike/`) is gone; `docs/plans/COMIC-RENDERER-SPIKE.md` says
  how to get it back from history.

## 2026-10-22 — The panels of a comic page, from a scene's steps

PR 2.2 of `docs/plans/COMIC-STAGE-2-PLAN.md`: the page-plan generator, pure
TypeScript. Nothing draws it yet; the comic reader (2.4) and the editor's
Preview (2.6) will.

- `src/lib/comic/comic-script.ts`: the words of a scene as the comic sets
  them. Every sentence of a `text` step is a caption; every line of a
  `dialogue` step with words is a bubble with its speaker and sprite, an
  ordinary one until the author can pick another kind (stage 3). Words in
  quotes inside narration stay narration. Every element is addressed as
  `addressSentences` addresses it, so its anchor is the key its comic settings
  will be kept under; a scene saved before blocks were remembered is addressed
  by its steps' ids.
- An inline chip goes with the sentence that follows it in its block, as in
  the novel, where it runs on the tap that brings that sentence up. Rain, snow
  or fog right after words goes with the sentence before it, since the novel
  starts it while those words are on screen; so does a chip at the end of its
  block. A chip switched off or with a condition is not a chip, and a
  standalone effect, sound or music block is not one either.
- `src/lib/comic/comic-layout.ts`: the panels, in reading order. A narration
  sentence has a panel of its own; up to two lines of dialogue share one while
  the picture stays the same; a new background, a character coming on or any
  other change on screen opens the next. A panel nothing is put into never
  appears. The shot: the whole stage with the cast on a third for narration, a
  close-up for a short line and a medium shot for a longer one, a two-shot
  when two talk in one panel, and the author's own camera over all of these.
- Pages are not cut in TypeScript. The renderer cuts them from what it
  measures, since fixed cuts lost bubbles at twice the text size in the
  renderer spike; each panel carries the length of its words as a hint.
- One generator, two ways in: the author's plan walks every step in order and
  works out the screen as the executor would, rain set up ahead included; the
  reader's plan takes the stops the executor made, each with its own snapshot
  (`Pick<SceneState, 'backgroundAssetId' | 'characters' | 'cameraState' |
  'activeEffects'>` fits as it is), so a step run again by a `goto` is a second
  panel further down. A straight scene gives the same panels both ways, which
  a test checks against the real executor. The same stops always give the same
  plan, and the plan is plain data.

## 2026-10-22 — One run of a scene for every way of showing it

PR 2.3 of stage 2 in `docs/plans/COMIC-STAGE-2-PLAN.md`. The novel reads as
before.

- **`SceneRuntimeHost`** (`src/components/reader/SceneRuntimeHost.tsx`) owns
  the scene's executor; the reader takes it with `useSceneRuntime()`, and the
  comic reader will take the same one. Showing the scene another way then
  neither restarts it, nor applies `score += 1` twice, nor plays its sounds
  again. The reader screen and the editor's play mode mount the host where
  they mounted the reader, keyed the same way; it starts each run from the
  variables the scene was entered with. `StoryReaderResponsive` no longer
  takes `timeline`, `initialVariables` or `playbackGeneration`.
- **The execution journal.** The executor lists every stop it reaches, in
  order, with what could be seen there (background, characters, camera,
  effects, the speaker, the choices): the path the scene actually took. A
  step reached again by a backward `goto` is a new entry; a finished
  typewriter adds nothing; a rollback takes back the stops it undoes; a
  restart or a loaded save clears it; a choice remembers the option picked.
  Unlike the rollback stack, which keeps the last 100 stops, it keeps the
  whole scene.

## 2026-10-22 — A scene can be set to always be read as a comic page

PR 2.1 of stage 2 in `docs/plans/COMIC-STAGE-2-PLAN.md`. Nothing reads it
yet: the comic reader and the editor's switch come with the next PRs.

- A scene may carry `comic.presentation`: `'comic'` or `'novel'` to always
  be read that way, whatever the story's format; none (or `'auto'`) follows
  the format. Story JSON import keeps it and drops one it cannot read, keeping
  the scene; the reader's projection of a scene carries it; a release ships
  it.
- `src/lib/comic/comic-presentation.ts` decides how a scene is read, from the
  story's format, the scene's setting and the reader's choice when the story
  offers both. A scene that plays a video or holds an interactive object is
  read as the novel even when set to always be a comic, since a comic page
  cannot show either yet; a switched-off step does not count, a step with
  conditions does.

## 2026-10-21 — A block keeps its id across save and reopen

Stage 0 of `docs/plans/COMIC-MODE-PLAN.md`; useful on its own to everything
that addresses blocks, the assistant's editor context among them.

- A step id did not survive a save: a block typed in the session, and every
  run of text beside an inline chip, was saved as new steps each time, so a
  block reopened under another id. Steps now carry `originBlockId` (and
  `originPart` for a step made from one part of a block), and a scene opens
  with every block under the id it was saved from.
- Opening puts a block back together from its own steps only. It used to fold
  any run of text and inline chips into one line, so two blocks could come
  back as one; a line of dialogue with a chip came back as several. Steps
  saved before this keep the old grouping.
- A block's parts become one line again only when nothing of theirs would be
  lost. When the assistant gave one part another speaker or sprite, more
  lines, a condition, its own text speed, or switched it off, the parts open
  as lines of their own. A step put between the parts, or a chip switched off
  among them, breaks the line in two; the second half opens as its own line,
  with no spaces standing for the parts before it.
- A step that never named a block and is its whole block under its own id is
  saved without the fields, so a scene whose blocks all came from the store
  saves exactly as before. A step that names a block keeps naming one.
- Two steps stored under one id get two ids when the scene opens. An
  assistant's `replace_step` keeps the replaced step's block, also when the
  new step has an id of its own and the block named none: a block that opened
  under the replaced step's id, or a line of text and chips saved before this
  that opened under it. Such a line whose text has a speed of its own opens
  as lines of their own after that, rather than lose the speed.
- A choice added in the editor is saved under its block's id, and a choice
  opens under its step's id, so the block and its step share one id: the
  branch switcher finds the choice by its block, the story's branches by its
  step.
- Story JSON import keeps `originBlockId` and `originPart`. An origin it
  cannot read is dropped: the step opens as a block of its own and keeps its
  words, as any other step does.
- `src/lib/comic/comic-anchors.ts`: a sentence's address
  (`<blockId>/p<part>/s<sentence>`), its print (the normalized full sentence),
  and how an anchored setting finds its sentence again after edits — bound,
  moved (once in the block, or once in the scene), changed (a corrected typo),
  or detached. Nothing is fastened anew by guesswork. Every line of a dialogue
  step is addressed, its sentences numbered on from one line to the next.
  Telling whether two sentences are alike skips those too far apart in length
  and stops counting an edit once it is too long.

## 2026-10-18 — Changing the block the author has open

- **The assistant sees the settings of the block in focus.** When the author
  has a non-text block in hand — a background, a choice, a transition, a chip —
  the editor context now carries that step's `data` as stored, next to its
  `stepId`. Settings over 4 KB are left out (the scene still has them). When
  the context has to shrink to its 16 KB, a block that is only selected gives
  up its settings before the selected text does; a block whose settings are
  open keeps them and the text is shortened instead.
- **`update_step`**, a sixth scene patch operation: `{ op: 'update_step',
  stepId, data: { … } }` changes only the named fields of one step's `data`
  and leaves the rest of the step as it was. The fields are checked against the
  step's block type — an unknown field or a value the type does not accept is
  refused by name — and what the changed fields refer to is checked as for a
  new step; fields left alone are not held against the change. It works in
  change sets and for an external agent over MCP as well, and the proposal
  card shows it as the fields it changes.
- With both, changing a setting of the focused block needs no read of the
  scene: `focus.stepId`, `focus.data` and `scene.revision` are enough.

## 2026-10-18 — The assistant sees the author's place; an agent of your own

Plan: `docs/technical/ai-editor-context-and-mcp-plan.md` (v1.20).

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
