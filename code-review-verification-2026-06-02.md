# Code Review Verification — 2026-06-02

> Verifying findings from [[code-analysis-report-2026-06-02|Analysis Report 2026-06-02]]
> Verdict: **3 issues FIXED, 4 PARTIALLY FIXED, 4 STILL PRESENT** (across the 11 issues)

## Summary table

| ID  | Issue                                                  | Status             | Notes                                                                     |
| --- | ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------- |
| H1  | DocumentSceneEditor God Component (719 LOC, 34 hooks)  | PARTIALLY FIXED    | 562 LOC (~22% smaller), ~9 hooks in main body, but still 562 LOC          |
| H2  | DocumentSceneEditor missing accessibility              | FIXED              | 7 `accessibilityHint` + multiple `accessibilityLabel`/`accessibilityRole` |
| M1  | `__DEV__`-unguarded console.log in `lib/_core/api.ts`  | FIXED              | All 14 console calls in lines 60-194 are guarded by `if (__DEV__)`        |
| M2  | Hardcoded `rgba()` in 6 components                     | PARTIALLY FIXED    | 3/6 files fixed (ReaderControls, BlockLibraryPanel, MigrationErrorBanner) |
| M3  | SceneComposer phone layout overflow                    | PARTIALLY FIXED    | Extracted to `SceneComposerPhone.tsx`; 6 header buttons + 5 tabs remain   |
| M4  | Unbounded `moduleUriCache` / `modulePlayableCache`     | FIXED              | Bounded by `MODULE_CACHE_MAX_SIZE = 50` with `evictOldest`                |
| M5  | CRLF line endings in `components/story-reader-responsive.tsx` | FIXED      | 0 CRLF, 262 LF-only lines                                                 |
| L1  | `file://` allowed in `isSafeUri()`                     | PARTIALLY FIXED    | Now platform-gated: only on `Platform.OS !== 'web'`                       |
| L2  | Barrel import from `@/lib/types` in `stores/use-app-store.ts` | FIXED      | Line 16 now imports from `@/lib/engine/types`                             |
| L3  | Missing accessibility hints in Editor components       | FIXED              | PropertiesPanel (4), TimelinePanel (4), BlockLibraryPanel (2)             |
| L4  | `isRunningInPreviewIframe()` dead code                 | FIXED              | `lib/_core/manus-runtime.ts` was deleted; zero references in codebase    |

## Detailed findings

### H1: DocumentSceneEditor God Component
- **Reported:** 719 LOC, 34 hooks
- **Current:** **562 LOC**, **9 hook calls in main body** (7 `useState`, 2 `useCallback`; 0 direct `useEffect`/`useRef`; 2 custom hooks `useDocumentScroll` + `useBlockOperations`)
- **Status:** PARTIALLY FIXED — file header now states "Refactored from 719 LOC God Component to ~250 LOC by extracting useDocumentScroll and useBlockOperations"; reality is 562 LOC (file includes the exported `saveDocumentSceneToRecord` helper at 548-562 which is ~14 LOC). The refactor reduced hooks from 34 to 9 in the main body, but the file still exceeds 500 LOC.
- **Evidence:** `components/document-editor/DocumentSceneEditor.tsx:1-562`; file comment at lines 4-14

### H2: DocumentSceneEditor missing accessibility
- **Reported:** 0 labels / 0 roles / 0 hints
- **Current:** **7 `accessibilityHint`**, multiple `accessibilityLabel`, multiple `accessibilityRole` (Note: H2 report was for DocumentSceneEditor specifically)
- **Status:** FIXED
- **Evidence:** `components/document-editor/DocumentSceneEditor.tsx:198,199,279,280,305,306,337,338,364,365,395,396,446,447`

### M1: `__DEV__`-unguarded console.log in `lib/_core/api.ts`
- **Reported:** Lines 89, 91, 98 un-guarded
- **Current:** **All 14 console calls in lines 60-194 are wrapped in `if (__DEV__)`**
  - L64: `if (__DEV__) console.log("[API] apiCall:", ...)` — guarded
  - L67: `if (__DEV__) console.log("[API] Authorization header added")` — guarded
  - L70: `if (__DEV__) console.log("[API] apiCall:", ...)` — guarded
  - L78: `if (__DEV__) console.log("[API] Full URL:", url)` — guarded
  - L81: `if (__DEV__) console.log("[API] Making request...")` — guarded
  - L88-92: `if (__DEV__) { console.log(...); console.log(...); }` — guarded
  - L96-98: `if (setCookie && __DEV__) { ... console.log(...) }` — guarded
  - L103: `if (__DEV__) console.error("[API] Error response:", ...)` — guarded
  - L117, L122, L140, L148, L153, L194 — all guarded
- **Status:** FIXED
- **Evidence:** `lib/_core/api.ts:60-200`

### M2: Hardcoded `rgba()` in 6 components
- **Reported:** ReaderControls (4), BlockLibraryPanel (1), MigrationErrorBanner (1), WebSidebar (2), app/tabs/index.tsx (3) — total 11
- **Current actual count:**
  - `components/reader/ReaderControls.tsx`: **0** (was 4) — FIXED
  - `components/editor/BlockLibraryPanel.tsx`: **0** (was 1) — FIXED
  - `components/MigrationErrorBanner.tsx`: **0** (was 1) — FIXED
  - `components/WebSidebar.tsx`: **2** (unchanged) at lines 140, 182 — STILL PRESENT
  - `app/tabs/index.tsx`: **3** (unchanged) at lines 38, 50, 56 — STILL PRESENT
  - **Total: 5 remaining (down from 11)**
- **Status:** PARTIALLY FIXED — 6 of 11 individual rgba() uses removed (3/5 files fully fixed)
- **Evidence:** `components/WebSidebar.tsx:140,182`; `app/tabs/index.tsx:38,50,56`

### M3: SceneComposer phone layout overflow
- **Reported:** 5 tabs + 7+ header buttons overflow on small screens
- **Current:** Layout has been **extracted into `components/editor/SceneComposerPhone.tsx`** (the parent `SceneComposer.tsx` is now only 195 LOC and delegates to `SceneComposerPhone`/`SceneComposerDesktop` subcomponents).
  - Phone header buttons (`SceneComposerPhone.tsx` lines 172-224): **6 buttons** (back, undo, redo, blocks, preview, save)
  - Phone tabs (lines 227-253): **5 tabs** (blocks, timeline, preview, document, scenes)
- **Status:** PARTIALLY FIXED — overflow concern mitigated by extraction, but the count of buttons (6) and tabs (5) remains similar to the original (7+/5). On screens < 360px wide, the horizontal `ScrollView` for tabs (line 227) provides overflow handling, but the header still has 6 Pressables in a `flexDirection: 'row'` (line 80) without overflow protection.
- **Evidence:** `components/editor/SceneComposer.tsx:174-186`; `components/editor/SceneComposerPhone.tsx:172-253`

### M4: Unbounded moduleUriCache / modulePlayableCache
- **Reported:** Both caches were `Map<>` with no size limit or TTL
- **Current:** Both caches now bounded by `MODULE_CACHE_MAX_SIZE = 50` with `evictOldest` LRU eviction
  - Line 21: `const MODULE_CACHE_MAX_SIZE = 50;`
  - Line 23-28: `evictOldest(cache, maxSize)` deletes oldest entry when size >= max
  - Line 286: `evictOldest(modulePlayableCache, MODULE_CACHE_MAX_SIZE); modulePlayableCache.set(...)` — invoked before set
  - Line 301: `evictOldest(moduleUriCache, MODULE_CACHE_MAX_SIZE); moduleUriCache.set(...)` — invoked before set
  - Note: No TTL on these (only the `uriCache` and `playableUriCache` at lines 19-20 have TTL of 5 min)
- **Status:** FIXED — size bounded; TTL still absent (was not in original requirement)
- **Evidence:** `lib/asset-resolver.ts:21,23-28,30-31,286,301`

### M5: CRLF line endings in `components/story-reader-responsive.tsx`
- **Reported:** File had `\r\n` (Windows) line endings
- **Current:** **0 CRLF, 262 LF-only lines** (file has 293 total lines)
- **First bytes (hex):** `2F 2A 2A 0A` — `/ * *` followed by LF (0x0A), not CR (0x0D)
- **Status:** FIXED
- **Evidence:** `components/story-reader-responsive.tsx` (entire file)

### L1: `file://` allowed in `isSafeUri()`
- **Reported:** `file://` in the unconditional allow list
- **Current:** `file://` is now **platform-gated** — only added to allow list when `Platform.OS !== 'web'`
  ```typescript
  const allowedPrefixes = ['http://', 'https://', '/', './', 'asset://', 'assets/', 'blob:'];
  if (Platform.OS !== 'web') {
    allowedPrefixes.push('file://');
  }
  ```
- **Status:** PARTIALLY FIXED — web risk eliminated; native platforms still permit `file://` (intentional for Expo FileSystem)
- **Evidence:** `lib/story-validator.ts:29-32`

### L2: Barrel import from `@/lib/types` in `stores/use-app-store.ts`
- **Reported:** Line 16 imported `SaveSlot, PlaybackState` from `@/lib/types`
- **Current:** Line 16: `import type { PlaybackState } from '@/lib/engine/types';` (domain-specific). Line 17 imports `SaveSlot` from `@/lib/story-domain`. No `@/lib/types` import in file.
- **Status:** FIXED
- **Evidence:** `stores/use-app-store.ts:13-18`

### L3: Missing accessibility hints in Editor components
- **Reported:** `DocumentSceneEditor`, `BlockLibraryPanel`, `PropertiesPanel`, `TimelinePanel` had 0 `accessibilityHint`
- **Current:**
  - `components/editor/PropertiesPanel.tsx`: **4 `accessibilityHint`** (lines 104, 153, 202, 221) — FIXED
  - `components/editor/TimelinePanel.tsx`: **4 `accessibilityHint`** (lines 206, 263, 272, 281) — FIXED
  - `components/editor/BlockLibraryPanel.tsx`: **2 `accessibilityHint`** (lines 89, 288) — FIXED
  - `components/document-editor/DocumentSceneEditor.tsx`: **7 `accessibilityHint`** (see H2)
- **Status:** FIXED across all 4 components
- **Evidence:** see line numbers above

### L4: `isRunningInPreviewIframe()` dead code
- **Reported:** Function in `lib/_core/manus-runtime.ts`; no callers found
- **Current:** The file `lib/_core/manus-runtime.ts` **no longer exists** in the working tree (only `api.ts`, `auth.ts`, `theme.ts`, `nativewind-pressable.ts` remain in `lib/_core/`). `grep -r "isRunningInPreviewIframe"` returns **0 source matches** (only the wiki analysis reports reference the function name).
- **Status:** FIXED — function/file removed
- **Evidence:** `lib/_core/` directory listing (no `manus-runtime.ts`); grep returns no source matches

---

_Reviewed: 2026-06-02_
_Reviewer: gsd-code-reviewer (verification mode)_
_Depth: standard_
