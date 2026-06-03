# Phase 14: Audit Hardening — Context

**Gathered:** 2026-06-02
**Status:** Ready for planning
**Source:** Project-Wide Audit (`audit-2026-06-02.md`)

<domain>

## Phase Boundary

Resolve the **3 CRITICAL + 7 WARNING + 5 high-impact INFO** findings from the 2026-06-02 comprehensive audit (157 files, 25,221 LOC). The audit succeeded Phase 13 (4 fixes) and identified new debt created by the post-Phase-12 work.

**Source:** `audit-2026-06-02.md` (verdict 7.0/10)

**In scope (5 tasks, ~5.5 hours):**
1. **CR-3 / WR-1** — `__DEV__` guard sweep (12 files) + `setTimeout` cleanup in 2 save handlers
2. **WR-4 / WR-5 / C-6** — Extract `withAlpha(color, alpha)` helper, replace 10 hex-alpha hacks + 3 rgba() sites
3. **CR-1 / CR-2** — Sanitize OAuth callback user logging and remove session-token prefix log
4. **WR-2 / C-1** — Decompose `PropertiesPanel.tsx` (1094 LOC, 12-block switch) into 12 per-block subcomponents
5. **WR-3 / C-5** — Refactor `useReaderAudio` to module-level singleton; fix `useEffect` deps causing re-initialization

**Out of scope (deferred to future phase):**
- Low-priority INFO findings (C-2 SceneManager split, C-3 SceneSelector split, C-4 `as unknown as` audit, C-7 O(n²) findIndex, C-8 demo story cast, C-9 devLog helper, C-10 persist hydration helper, U-1 character preview, U-2 AudioPlayerService useRef, U-4 SceneManager hook, U-5 SaveSceneDialog a11y hint)
- S-1 through S-6 security positives (no action needed)
- C-1 already covered by WR-2

</domain>

<decisions>

## Implementation Decisions

### Task 1: __DEV__ guard sweep + setTimeout cleanup (CR-3, WR-1)

**Reported:** 12 unguarded `console.*` calls + 2 `setTimeout` without cleanup

**Unguarded `console.*` locations (from audit):**
- `app/tabs/index.tsx:175,183,210,229,244,249`
- `app/reader.tsx:64`
- `lib/engine/useSceneExecutor.ts:38,204,269`
- `lib/editor/story-manuscript-save.ts:77,84` ⚠️ (most concerning — saves happen on every scene)
- `stores/use-app-store.ts:460,463`
- `hooks/useReaderAudio.ts:194`
- `app/oauth/callback.tsx:46` ⚠️ (CR-1 — full User object, contains email)

**setTimeout without cleanup:**
- `components/editor/SceneComposer.tsx:100` (`setTimeout(() => setIsSaving(false), 500)`)
- `components/document-editor/DocumentSceneEditor.tsx:138` (`setTimeout(() => setIsSaving(false), 250)`)

**Locked decision:**
- For `console.*`: wrap in `if (__DEV__)` (mechanical change, ~30 calls)
- For `setTimeout`: store ID in `useRef<NodeJS.Timeout | null>`, clear in `useEffect` cleanup
- Do NOT introduce a `devLog()` helper (C-9 is out of scope per audit)
- The 2 CRITICAL security logs (CR-1, CR-2) are NOT in this task — they are Task 3

**Acceptance target:**
- `grep -rn "console\.\(log\|warn\|error\)" --include="*.ts" --include="*.tsx" app/ lib/ stores/ hooks/ | grep -v "if (__DEV__)" | grep -v "if (!__DEV__)"` returns 0
- `grep -n "setTimeout" components/editor/SceneComposer.tsx components/document-editor/DocumentSceneEditor.tsx` shows timeout IDs stored in refs with cleanup

### Task 2: withAlpha helper + replace hex-alpha hacks (WR-4, WR-5, C-6)

**Reported:** `+ '15'`, `+ '20'`, `+ '30'`, `+ '40'` hex-alpha concatenation in 7 files + 3 `rgba()` in app/tabs

**Hex-alpha sites (from audit):**
- `components/WebSidebar.tsx:87` (`+ '15'`)
- `components/editor/SceneComposerPhone.tsx:140` (`${colors.primary}12`)
- `components/editor/SceneSelector.tsx:338,425` (`+ '20'`, `+ '15'`)
- `components/editor/MiniPreview.tsx:96,161` (`+ '30'`, `+ '20'`)
- `components/editor/PreviewScreen.tsx:170` (`+ '30'`)
- `components/editor/TimelinePanel.tsx:191` (`+ '40'`)
- `components/editor/modals/SaveSceneDialog.tsx:165` (`+ '20'`)

**rgba() sites:**
- `app/tabs/index.tsx:38,50,56`

**Locked decision:**
- Create `withAlpha(color: string, alpha: number): string` helper in `lib/_core/theme.ts` (next to `useColors` hook)
- Handle BOTH hex (`#rrggbb` + `aa`) AND `rgb()`/`oklch()` formats safely
- Re-export from `theme.config.d.ts` if needed for type augmentation
- Replace ALL hex-alpha concatenations with `withAlpha(colors.primary, 0.2)` etc.
- Move the existing inline `withOpacity` helper from `app/tabs/index.tsx:36-55` to `lib/_core/theme.ts` and rename to `withAlpha` for consistency
- Update all 3 `rgba()` in `app/tabs/index.tsx` to use `withAlpha`

**Acceptance target:**
- `lib/_core/theme.ts` exports `withAlpha`
- `grep -nE "\\+\\s*['\"]?[0-9]{2}['\"]?" --include="*.ts" --include="*.tsx" components/ app/` returns 0 (no more hex-alpha concat)
- `grep -c "rgba(" app/tabs/index.tsx components/` returns 0 (all replaced)
- Existing `useColors()` hook unchanged (no regression)

### Task 3: Sanitize OAuth/token logging (CR-1, CR-2)

**Reported:**
- CR-1: `app/oauth/callback.tsx:46` logs full `User` object (incl. email) — PII leak in dev
- CR-2: `lib/_core/api.ts:153-157` and `:194` log first 50 chars of session token — token entropy reduction

**Locked decision:**
- CR-1: Replace `console.log("[OAuth] User info fetched from API:", authUserInfo)` with `console.log("[OAuth] User fetched:", { id: authUserInfo.id, openId: authUserInfo.openId })` (no email, no name, no loginMethod)
- CR-2: Replace `sessionToken ? \`${sessionToken.substring(0, 50)}...\`` with `!!sessionToken` boolean. Use `hasSessionToken: !!sessionToken` in both `exchangeOAuthCode` and `establishSession`
- The same `__DEV__` guard from Task 1 already applies to these (they are already inside `if (__DEV__)` blocks per audit)

**Acceptance target:**
- `app/oauth/callback.tsx:46` does NOT log `email`, `name`, or `loginMethod`
- `lib/_core/api.ts:153` and `:194` log only `hasSessionToken: !!sessionToken` (or similar boolean)
- `grep -n "sessionToken.substring" lib/_core/api.ts` returns 0

### Task 4: Decompose PropertiesPanel (WR-2, C-1)

**Reported:** `components/editor/PropertiesPanel.tsx` is 1094 LOC with a 12-case `switch` in `renderForm()` (lines 200-1080). New god component after Phase 13 refactored DocumentSceneEditor.

**Locked decision:**
- Extract each of the 12 block-type property forms into a separate subcomponent file in `components/editor/properties/`:
  - `BackgroundPropertiesForm.tsx`
  - `CharacterPropertiesForm.tsx`
  - `DialoguePropertiesForm.tsx`
  - `ChoicePropertiesForm.tsx`
  - `MusicPropertiesForm.tsx`
  - `VariablePropertiesForm.tsx`
  - `ConditionPropertiesForm.tsx`
  - `JumpPropertiesForm.tsx`
  - `ScenePropertiesForm.tsx` (or similar — for scene-level)
  - (3 more — exact list derived from switch cases)
- Each subcomponent ~80 LOC, takes the block as prop, returns the form UI
- `PropertiesPanel.tsx` becomes a thin orchestrator (~150 LOC) that just dispatches via lookup map
- Use a registry pattern: `const formRegistry: Record<BlockType, ComponentType<{block: T}>> = {...}`
- PRESERVE all existing behavior (no UX changes)
- PRESERVE any existing accessibility labels

**Acceptance target:**
- `wc -l components/editor/PropertiesPanel.tsx` ≤ 200 (was 1094)
- `ls components/editor/properties/*.tsx | wc -l` returns 10-12 (one per block type)
- `grep -c "switch.*block.type\|switch.*type" components/editor/PropertiesPanel.tsx` returns 0 (no more big switch)
- `pnpm run check` exits 0

### Task 5: useReaderAudio singleton + dep fix (WR-3, C-5)

**Reported:** `hooks/useReaderAudio.ts:298-312` has 2 `useEffect`s depending only on `[audioManager]`. Every parent re-render passing a new `audioManager` reference causes:
1. `useEffect:298-304` to call `stopReaderPlayback(audioManager)` — interrupting playback
2. `useEffect:306-312` to call `audioManager.initialize()` again
3. `useFocusEffect` at 241-250 has the same issue

**Locked decision:**
- Make `enhancedAudioManager` a module-level singleton in `lib/audio-player-service.ts` (or similar) — already is, per audit, but the hook receives it as a prop
- Drop `audioManager` from the 2 affected `useEffect` dep arrays (or use `useRef` pattern)
- Guard `initialize()` with a module-level `initPromise: Promise<void> | null` singleton — call once
- Stop passing `audioManager` as a prop to `useReaderAudio` — import directly from the singleton module
- Find all call sites of `useReaderAudio(audioManager)` and update to `useReaderAudio()` (no args)

**Acceptance target:**
- `hooks/useReaderAudio.ts` no longer accepts `audioManager` as a parameter
- `grep -n "useReaderAudio(.*[a-zA-Z]" app/ components/` shows no callers passing an arg
- `grep -n "audioManager" hooks/useReaderAudio.ts` shows the symbol is imported, not received as prop
- The `useEffect` at L298-312 has empty or stable deps (no `audioManager` in array)
- `pnpm run check` exits 0

### the agent's Discretion

- Exact split of PropertiesPanel subcomponents (10 vs 11 vs 12 files) — agent picks based on actual switch cases
- Whether to also create a `devLog()` helper in Task 1 (out of scope per audit, but quick win) — agent decides
- The exact placement of `withAlpha` in `lib/_core/theme.ts` (top vs bottom of file)
- Whether to add a unit test for `withAlpha` (small, low-risk — agent decides)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source audit
- `audit-2026-06-02.md` — Source of truth for all findings (CR-1 through C-10)

### Files to be modified
- `app/tabs/index.tsx` — Task 1 (6 console calls), Task 2 (3 rgba, inline withOpacity move)
- `app/reader.tsx` — Task 1 (1 console call)
- `app/oauth/callback.tsx` — Task 3 (CR-1)
- `lib/_core/api.ts` — Task 3 (CR-2)
- `lib/_core/theme.ts` — Task 2 (withAlpha helper, ~L150-200)
- `lib/engine/useSceneExecutor.ts` — Task 1 (3 console calls)
- `lib/editor/story-manuscript-save.ts` — Task 1 (2 console calls)
- `stores/use-app-store.ts` — Task 1 (2 console calls)
- `hooks/useReaderAudio.ts` — Task 1 (1 console call), Task 5 (refactor)
- `components/editor/SceneComposer.tsx` — Task 1 (setTimeout cleanup at L100)
- `components/document-editor/DocumentSceneEditor.tsx` — Task 1 (setTimeout cleanup at L138)
- `components/WebSidebar.tsx` — Task 2 (hex-alpha at L87)
- `components/editor/SceneComposerPhone.tsx` — Task 2 (hex-alpha at L140)
- `components/editor/SceneSelector.tsx` — Task 2 (hex-alpha at L338, L425)
- `components/editor/MiniPreview.tsx` — Task 2 (hex-alpha at L96, L161)
- `components/editor/PreviewScreen.tsx` — Task 2 (hex-alpha at L170)
- `components/editor/TimelinePanel.tsx` — Task 2 (hex-alpha at L191)
- `components/editor/modals/SaveSceneDialog.tsx` — Task 2 (hex-alpha at L165)
- `components/editor/PropertiesPanel.tsx` — Task 4 (decompose from 1094 LOC)
- `lib/audio-player-service.ts` — Task 5 (singleton initPromise)

### Files to be created
- `components/editor/properties/BackgroundPropertiesForm.tsx` — Task 4
- `components/editor/properties/CharacterPropertiesForm.tsx` — Task 4
- `components/editor/properties/DialoguePropertiesForm.tsx` — Task 4
- `components/editor/properties/ChoicePropertiesForm.tsx` — Task 4
- `components/editor/properties/MusicPropertiesForm.tsx` — Task 4
- `components/editor/properties/VariablePropertiesForm.tsx` — Task 4
- `components/editor/properties/ConditionPropertiesForm.tsx` — Task 4
- `components/editor/properties/JumpPropertiesForm.tsx` — Task 4
- (3-4 more form files — exact count from PropertiesPanel switch)

### Theme system reference
- `theme.config.js` — existing token definitions
- `lib/_core/theme.ts` — `useColors` hook (L150-200), RuntimePalette type (with `[key: string]: string | undefined` index signature per AGENTS.md)
- `global.css` — oklch token values

### Prior phase patterns to follow
- `.planning/phases/10-security-hardening/10-PLAN.md` — Pattern for security-critical changes
- `.planning/phases/13-post-audit-remediation/13-01-PLAN.md` — Wave 1 pattern (parallel tasks)
- AGENTS.md — `RuntimePalette` index signature rule

</canonical_refs>

<specifics>

## Specific Ideas

**From audit evidence:**

- **CR-1 evidence:** `app/oauth/callback.tsx:46` — `console.log("[OAuth] User info fetched from API:", authUserInfo)` where `authUserInfo` is type `User` with `id`, `openId`, `email`, `name`, `loginMethod`. The fix is to log only `id` and `openId`.

- **CR-2 evidence:** `lib/_core/api.ts:153-157` — `console.log("[OAuth] Exchanging code for session token", { sessionToken: sessionToken ? \`${sessionToken.substring(0, 50)}...\` : null });` and similar at L194. Fix: `{ hasSessionToken: !!sessionToken }`.

- **Task 1 evidence:** All 12 `console.*` sites listed in CR-3 above. Mechanical wrap in `if (__DEV__)`.

- **Task 2 evidence:** The `+ '15'` etc. pattern is fragile — works for `#rrggbb` but breaks if `colors.primary` becomes `oklch()`. The `withAlpha` helper should detect format and handle both.

- **Task 4 evidence:** `components/editor/PropertiesPanel.tsx` has a `renderForm()` function with a `switch (block.type)` likely at L200-1080 (12 cases). Each case is a separate form section. Extract one subcomponent per case.

- **Task 5 evidence:** `useReaderAudio.ts:298-304` is `useEffect(() => { return () => { stopReaderPlayback(audioManager); }; }, [audioManager]);` — every audioManager ref change → stop. And L306-312 is `useEffect(() => { audioManager.initialize().catch(...) }, [audioManager]);` — re-initialize on every change.

</specifics>

<deferred>

## Deferred Ideas

- **Task 4 sub-split:** Could also extract to `properties/forms/` subdirectory if 12 files in `properties/` feels too flat — agent decides
- **Task 5 additional cleanup:** The 11-line `useEffect` at L215 with 11 dependencies is a separate refactor opportunity (C-5) — out of scope for this phase
- **C-9 devLog helper:** Audit flagged 11 `__DEV__` checks in `api.ts`; could DRY into a helper — out of scope
- **C-10 persist hydration helper:** Same pattern duplicated in `app/tabs/index.tsx:140-149` — out of scope
- **Low-priority INFO findings (U-1 through C-10)**: 11 items, deferred to a future polish phase

</deferred>

---

*Phase: 14-audit-hardening*
*Context gathered: 2026-06-02 via Project-Wide Audit*
*Source: `audit-2026-06-02.md` (verdict 7.0/10)*
