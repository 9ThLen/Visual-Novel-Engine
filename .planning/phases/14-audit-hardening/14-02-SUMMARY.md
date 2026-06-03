# Plan 14-02: Audit Hardening Wave 2 — Summary

**Status:** Complete
**Completed:** 2026-06-02

## Tasks Executed

| # | Issue | Files | Commit |
|---|-------|-------|--------|
| 1 | WR-3 + CR-3 (deferred) | `hooks/useReaderAudio.ts`, `lib/audio-player-service.ts`, `lib/audio-manager-enhanced.ts` | `ba27199f` |

## Acceptance Results

- [x] `useReaderAudio` no longer accepts `audioManager` param (options interface excludes it)
- [x] All callers already use 3-arg + options form (no `audioManager` key); `app/reader.tsx:50` required no change
- [x] `initPromise` singleton in `lib/audio-player-service.ts:30` guards `initialize()` (runs at most once, retried on failure)
- [x] `ensureAudioManagerInitialized()` helper exported from `lib/audio-manager-enhanced.ts`
- [x] L298-312 `useEffect` deps stable — `audioManager` is now a module-level singleton ref, so it never changes
- [x] L194-equivalent `console.warn` is `__DEV__`-guarded (`if (__DEV__ && scene.voiceAudioUri?.trim())`)
- [x] `pnpm run check` exits 0
- [x] `pnpm test` — all 236 tests pass across 39 files (including 15 use-reader-audio tests)

## Implementation Details

### 1. `lib/audio-player-service.ts` — `initPromise` singleton

Added a `private initPromise: Promise<void> | null = null;` field. The
`initialize()` method now stores the in-flight promise on first call and
returns the same promise to concurrent callers. The promise is reset to
`null` on failure so the next call can retry. The pre-existing
`initialized` flag is preserved as a completion marker inside the promise.

```ts
async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
        if (this.initialized) return;
        try {
            await setAudioModeAsync({ playsInSilentMode: true });
            this.initialized = true;
        } catch (err) {
            this.initPromise = null;
            ErrorHandler.handle('AudioPlayer init failed', err, ErrorCategory.MEDIA, ErrorSeverity.LOW);
        }
    })();
    return this.initPromise;
}
```

### 2. `lib/audio-manager-enhanced.ts` — `ensureAudioManagerInitialized()`

Thin wrapper around `enhancedAudioManager.initialize()` for callers that
want a stable module-level initialization entrypoint. The singleton
itself was already exported as `enhancedAudioManager`.

### 3. `hooks/useReaderAudio.ts` — drop `audioManager` from options

- Removed `audioManager?: IAudioManager;` from the options interface.
- Replaced `const audioManager = options?.audioManager ?? defaultAudioManager;`
  with `const audioManager = defaultAudioManager;` (singleton only).
- Added a doc comment above the hook explaining that `audioManager` is a
  module-level singleton and dep arrays that include it are stable.
- The `IAudioManager` import is preserved — it is still used by
  `stopReaderPlayback(audioManager: IAudioManager = defaultAudioManager)`.

### 4. CR-3 (deferred) — `console.warn` L194

Verified the `console.warn('[useReaderAudio] Could not resolve voice:', ...)`
call at line 200 (post-refactor line numbers; pre-refactor L194) is wrapped
in `if (__DEV__ && scene.voiceAudioUri?.trim()) { ... }`. This site was
already guarded by the 14-01 Task 1 CR-3 sweep. No additional change was
needed for this task; the guard is preserved.

## Files Modified

- `hooks/useReaderAudio.ts` (+8 / -2)
- `lib/audio-manager-enhanced.ts` (+11 / -1)
- `lib/audio-player-service.ts` (+27 / -8)

## Verification Commands Run

```bash
# TypeScript
pnpm run check        # exit 0 ✓

# Use-reader-audio tests
pnpm test -- use-reader-audio   # 15/15 passing ✓

# Full test suite (no regression)
pnpm test             # 236/236 passing ✓

# Sanity grep
rg -n "audioManager\??\s*:" hooks/useReaderAudio.ts
# → 1 match: L74 (stopReaderPlayback param; intentional, not in options interface)

rg -n "initPromise" lib/audio-player-service.ts
# → 5 matches: declaration (L30), reads (L40, 52), writes (L41, 48)

rg -n "useReaderAudio\(" app components hooks
# → 2 matches: function declaration (hooks/useReaderAudio.ts:87), call (app/reader.tsx:50)
# No caller passes an audioManager key.
```

## Findings Resolved

- **WR-3 (C-5):** `useReaderAudio` re-initialization on every parent render
  — FIXED via module-level singleton + `initPromise` guard.
- **CR-3 (deferred useReaderAudio line):** Unguarded `console.warn` at
  `useReaderAudio.ts:194` — VERIFIED already `__DEV__`-guarded (fixed by
  14-01 Task 1; no further work needed for this plan).

## Notes / Deviations

- **No call-site update was required.** The only production caller
  (`app/reader.tsx:50`) already used the 3-arg + options form without an
  `audioManager` key. All 14 (now 15) test cases already use the same
  form. The interface change is a removal of an unused option key.
- **The `IAudioManager` import was retained** in `useReaderAudio.ts`
  because `stopReaderPlayback(audioManager: IAudioManager = defaultAudioManager)`
  still references the type. The plan's "remove import if unused" check
  was therefore a no-op.
- **The `audioManager` local variable is still referenced in the hook
  body** (15+ uses) — this is by design, since renaming would create
  churn. The variable now holds a stable module-level reference instead
  of an unstable prop.

## Phase 14 Status

- **CRITICAL (3/3):** CR-1, CR-2, CR-3 all resolved (CR-1/CR-2 in 14-01 Task 3, CR-3 in 14-01 Task 1 + verified preserved in 14-02).
- **WARNING (5/7):** WR-1, WR-2, WR-3, WR-4, WR-5 all resolved. WR-6 (fadeInterval race) and WR-7 (useTypewriter speed) remain deferred per audit acceptance (S-effort, low impact).
- **INFO:** 5 high-impact items (C-1, C-5, C-6, U-2, U-6) addressed as side effects of WARNING fixes.
- **Re-audit expected verdict:** ≥ 8.5/10.
