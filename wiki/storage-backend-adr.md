# ADR: Local-first storage → Supabase backup

**Status:** Accepted · Phases 1–7 implemented · **Date:** 2026-07-14
**Deciders:** project owner + multi-model design review (verified against code)

## Context

- **Web** persists app-state and scene records to `localStorage` (~5 MB origin cap). Media is stored as `data:base64` URIs **inside** the app-state JSON.
- **Native** persists to `AsyncStorage` and stores media as real files via `expo-file-system` documentDirectory.
- `expo-file-system@55` has **no functional web backend** — both web impls are no-ops (`documentDirectory === null` / `console.warn('not supported on web')`). Verified in `node_modules/expo-file-system/src/legacy/ExponentFileSystemShim.ts` and `ExpoFileSystem.web.ts`. → Web media **must** use IndexedDB/OPFS directly.
- **Active data loss today:** `getPersistableMediaLibrary` ([lib/app-store-persistence.ts](../lib/app-store-persistence.ts)) drops any `data:` URI `> 256 KB`/file or `> 1 MB` total on **every** persist. Real images already vanish on web reload.
- `scene-record-storage.ts` is a hand-rolled crash-safe KV "database" (index + item payloads + write ordering) — not cheaply replaceable by SQL.
- No hosted backend exists. `constants/oauth.ts` is a **Manus template** (empty env, expects a separate API on :3000) — not reusable for Supabase Auth. `tools/ai-bridge` is localhost-only (`127.0.0.1`).

## Decision

| Layer | Choice |
|---|---|
| Web local | **IndexedDB** — `kv` store (Zustand state + scene records) + `media` store (Blobs) |
| Native local | **AsyncStorage + FileSystem** — unchanged |
| Cloud | **Supabase** — Postgres + private Storage, RLS by `auth.uid()` |
| Backend integration | Separate **`BackupService` / `SyncService`** — **not** a `StorageLike` persistence adapter |

App stays **local-first**: local write always commits first; backend runs async after. Network must never sit behind the `getItem/setItem/removeItem` contract.

**Rejected:** `expo-sqlite` (web needs COOP/COEP, which conflicts with the ONNX CDN import used by background removal; no query need justifies the migration). OPFS: defer until profiling shows IDB is too slow for large media.

## Roadmap (each step builds on the prior — do NOT build later steps early)

**Local (immediate — fixes active data loss + is the backend prerequisite):**
1. IndexedDB `kv` store + safe `localStorage` migration.
2. IndexedDB `media` store: Blobs + stable asset references. Convert **all** web upload paths `data:` → Blob.
3. Migrate surviving `data:` URIs → Blob; **only then** replace the size caps with an invariant.
4. Verify import/export, reader, editor, audio, reload.
5. Separate cleanup release (orphan GC with grace period).

**Cloud (later):**
6. `BackupManifest` + transport-independent `BackupService`.
7. Supabase Auth + Storage backup/restore.
8. Per-record Sync (Postgres, `SceneRecord` as JSONB + `revision`; revision-check before last-write-wins). CRDT only if real simultaneous same-scene editing appears.

---

## Execution plan — LOCAL stage (phases 1–5)

### Phase 1 — IndexedDB `kv` store + migration

**Goal:** replace `localStorage` on web with IndexedDB, moving both app-state and scene records (they share one `StorageLike`).

- New `lib/idb-storage.ts`: one DB `vne-storage` with object stores `kv` and `media`. The module has no browser API work at import time, so the shared import remains native-safe. It exports an async `StorageLike` (`getItem/setItem/removeItem`) over `kv`; Blob helpers are added in Phase 2 when first needed.
- [lib/persistent-storage.ts](../lib/persistent-storage.ts): in the `Platform.OS === 'web'` branch, return the IDB `StorageLike` instead of `createSafeWebStorage(localStorage)`. Keep the JSON-validation guard for `APP_STATE` and the try/catch + toast semantics.
- **Migration (safe, non-destructive):** before the first IDB read, one shared readiness promise runs a single `readwrite` transaction. Without a migration marker, copy every missing `vne_*` key (APP_STATE, canonical scenes, coverage, snapshots, and dynamic keys) into IDB and write the marker in the same transaction. Existing IDB values win, so a retry cannot replace newer data. Keep `localStorage` intact as the initialization fallback this release — do not delete it. If opening IDB or the migration fails, use `localStorage` for that session.
- No change to `createAppStoreStorage` ([lib/app-store-storage.ts](../lib/app-store-storage.ts)) or the store wiring (`createJSONStorage(createAppStoreStorage)`, [stores/use-app-store.ts:216](../stores/use-app-store.ts)) — already async-compatible.
- Also covers the direct write at [use-app-store.ts:238](../stores/use-app-store.ts).

**Verify:** load an existing localStorage-backed profile → data appears from IDB; scene records/reader window intact; no quota toast.

### Phase 2 — IndexedDB `media` store + Blob conversion at upload (implemented)

**Goal:** stop putting base64 in JSON; media lives in the `media` store, referenced by a stable key.

- **Reference format:** persisted `LibraryAsset.uri` on web becomes `idb://media/<storage-key>` (native keeps `file://…/media-library/…`, unchanged). Base64 uploads use the existing local `stableContentHash`; temporary `blob:` uploads use the generated asset ID (no sha256 yet — see corrections).
- **Single choke point** — [lib/media-library-service.ts](../lib/media-library-service.ts) `addAssetToLibraryPure`, invoked via [stores/media-library-actions.ts](../stores/media-library-actions.ts) `addAssetToLibrary`: on web, when the incoming `uri` is a `data:`/`blob:`, decode to a `Blob`, persist it under the selected storage key (skip when already present), and set `asset.uri = idb://media/<storage-key>`.
- **Cover every web upload entry point** so none bypasses the choke point:
  - [lib/pick-image.ts](../lib/pick-image.ts), [lib/web-file-input.ts](../lib/web-file-input.ts) (file pick / drag-drop)
  - [lib/remove-background.web.ts](../lib/remove-background.web.ts) (background-removal output)
  - editor paste — [components/vn-plate-editor/PlateWebViewEditor.web.tsx](../components/vn-plate-editor/PlateWebViewEditor.web.tsx)
  - audio path — [lib/audio-web-source.ts](../lib/audio-web-source.ts)
  - character sprites — the embedded editor uploads through its host bridge; the iframe receives a transient `blob:` preview while saves restore the stable `idb://media/<storage-key>` URI.
- **Resolution:** [lib/asset-resolver.ts](../lib/asset-resolver.ts) + [lib/media-library-service.ts](../lib/media-library-service.ts) `resolveLibraryAssetUri` learn `idb://media/<storage-key>` → `getBlob` → `URL.createObjectURL`, with a bounded in-memory `Map<key, objectURL>` cache. Object URLs are revoked on eviction and cache clear.
- Direct React Native `<Image>` consumers that display persisted library assets use [components/resolved-asset-image.tsx](../components/resolved-asset-image.tsx), so stable IDB references are resolved before rendering.

**Verify:** import an image > 256 KB on web → survives reload, renders in reader + editor; audio plays; object URLs not leaked (revoked on delete).

### Phase 3 — Migrate surviving `data:` URIs, then drop the caps (implemented)

**Order matters — this is the key safety correction.**

- One-time migration: [lib/web-media-migration.ts](../lib/web-media-migration.ts) moves each persisted `LibraryAsset` and historical character sprite still holding a `data:` URI through the Phase-2 Blob write, preserving asset/sprite IDs while rewriting the URI to `idb://media/<storage-key>`.
- **Only after** every Blob write succeeds, the migration swaps the migrated collections into Zustand and enables the persistence invariant. Until that moment the previous 256 KB/1 MB caps remain active as a rollback guard; on migration failure the source state is not mutated.
- Once enabled, `getPersistableMediaLibrary` ([lib/app-store-persistence.ts](../lib/app-store-persistence.ts)) rejects any `data:` **or ephemeral `blob:`** URI with a development warning instead of silently applying size-based eviction.
- **The migration must not be bound to one screen.** It runs in [stores/storage-bootstrap.ts](../stores/storage-bootstrap.ts), an idempotent shared promise kicked off by the root layout ([app/_layout.tsx](../app/_layout.tsx)) and awaited by Home. `document-editor`, `reader`, `story-home` etc. are top-level routes, so a web page refresh lands on them directly; gating the migration on Home would leave those sessions unmigrated with the lossy caps still active.
- **Honest limitation:** assets already dropped by the cap are gone from `localStorage` and cannot be recovered — only survivors migrate. Communicate this; users re-import large historical images.
- **Read path must not size-filter (fixed).** The caps used to run on hydration too (`migratePersistedAppState` / `mergePersistedAppState`), i.e. *before* the bootstrap could open the gate — so any inline asset over 256 KB was destroyed at hydrate, before the migration could rescue it. The size cap is a **write**-side quota guard (it protects the `localStorage` fallback used when IndexedDB is unavailable) and has no meaning on read. Hydration now uses `getHydratableMediaLibrary`, which keeps inline media regardless of size and drops only what the migration could never convert (ephemeral `blob:`, malformed data URIs) — keeping those would make the migration throw on every start and pin the caps open forever.

**Verify:** no `data:` URIs remain in migrated media-library or character-sprite state; cap removal doesn't reintroduce quota pressure. A user-facing storage durability/quota surface using `navigator.storage.persist()` and `navigator.storage.estimate()` remains a Phase-4 product check rather than a migration prerequisite.

### Phase 4 — Full regression pass

Exercise: import/export (still 10 MB JSON, media by reference — [lib/story-hooks.ts:38](../lib/story-hooks.ts)), reader window + prefetch, document editor, audio playback, background removal round-trip, hard reload, and native build (must be untouched — file paths, not `idb://`).

### Phase 5 — Orphan cleanup release (separate)

- **Not in the migration release** (safety correction #2). Ship a later pass that GCs `media` Blobs with **no reference** in the union of `mediaLibrary`, story metadata, character sprites, and canonical scenes, after a grace period. Prefer leaking a Blob over deleting a not-yet-loaded scene's asset.

---

## Corrections baked in (from final review)

1. **Cap removal is Phase 3, gated on Phase 2** — never remove caps before all upload paths convert `data:` → Blob, or unbounded base64 re-enters `localStorage`.
2. **No aggressive orphan cleanup in the migration release** — Phase 5, with a grace period and a complete scan of every persisted reference source.
3. **sha256 + Supabase stay out of the local stage** — cloud SHA-256 is implemented separately with `expo-crypto`; the existing local `stableContentHash` remains unchanged.

## Invariants

- Persisted `LibraryAsset.uri`: `idb://media/<storage-key>` (web) or `file://…` (native) — **never** `data:` after Phase 3 migrates existing survivors.
- Local write commits before any network. Backend is `BackupService`/`SyncService`, never a `StorageLike` adapter.
- `LocalRepository` is the only platform seam: media source is IDB Blob (web) or FileSystem file (native); `BackupService` reads via `getAssetBinary(assetId)`, never touches IDB directly.
- **`Blob` never crosses the backup boundary.** React Native's Blob is an opaque native handle: no `arrayBuffer()`, no `text()`, and its constructor *throws* on `ArrayBuffer`/`TypedArray` parts. Binary payloads travel as [`BackupBinary`](../lib/backup-binary.ts) (`size`/`mimeType`/`bytes()`), the only shape both platforms can produce and consume.
- **Scenes are captured from scene storage, never from the store.** The persist envelope is compacted to `sceneRecordsByStory: {}` and each story's records live in their own key, so the store map is empty on cold start and holds only a ~5-scene reader window for a story marked `'window'`. `captureBackupData` reads memory only when `sceneRecordHydration[storyId] === 'full'`, otherwise `loadSceneRecordsForStory`. `validateBackupManifest` enforces a `scenes` entry per story so this can never silently regress.
- **Only app-bundled media carries no bytes.** `assets/` and `bundle://` URIs restore from the app bundle. Everything else — `idb://`, `file://`, and remote `http(s)://` — must carry bytes: a backup that depends on a third-party URL still alive at restore time is not a backup. (No remote media exists today; every entry point produces `data:`, `file://` or `assets/`.)

## Backend stages (sketch, phases 6–8)

- **`BackupManifest` (Phase 6 implemented)** — versioned, decoupled from the Zustand envelope: `{ schemaVersion, backupId, createdAt, appVersion, stories, scenes, libraries, assets:[{ assetId, storageKey, sha256, mimeType, size }] }`. [lib/backup-service.ts](../lib/backup-service.ts) defines the transport-independent orchestration.
- **Phase 7 implemented:** [stores/backup-local-repository.ts](../stores/backup-local-repository.ts) captures canonical data (scenes from scene storage, see Invariants), stages IDB/native assets, creates pre-restore story snapshots, and activates restored state with rollback to the *complete* prior scene set; [lib/backup-crypto.ts](../lib/backup-crypto.ts) supplies SHA-256 over `BackupBinary`; [lib/supabase-backup.ts](../lib/supabase-backup.ts) supplies persisted Supabase Auth, immutable uploads (resumable > 6 MB on web, single-shot on native — TUS needs a Blob), private downloads, and `listBackups()`. Private-bucket/table RLS is versioned in [supabase/migrations/20260714000000_backup_storage.sql](../supabase/migrations/20260714000000_backup_storage.sql).
- **Phase 7 UI:** [app/cloud-backup.tsx](../app/cloud-backup.tsx) (sign in, back up, list, restore, delete), reached from the Cloud section of [app/settings.tsx](../app/settings.tsx); state in [hooks/use-cloud-backup.ts](../hooks/use-cloud-backup.ts); the client/service is built once in [stores/cloud-backup.ts](../stores/cloud-backup.ts).
- **Sign-in is a one-time email code** (`signInWithOtp` + `verifyOtp`), not a magic link or an OAuth provider: it is the only method that behaves identically on web and native with no deep-link scheme and no per-provider console setup, and the app never handles a password. Sessions persist through `createPersistentStorage()`.
- **Cloud backup is optional.** Without `EXPO_PUBLIC_SUPABASE_*` (see [.env.example](../.env.example)) the app stays fully local-first and the Cloud section says so; nothing else changes. The publishable key is safe in the bundle — every policy is scoped to `auth.uid()`.
- **Deleting sweeps, and bails out when unsure.** Assets are content-addressed and therefore shared between snapshots, so `deleteBackup` removes the snapshot row first, then deletes only the assets no surviving manifest names. If any manifest — the target's own or a survivor's — cannot be read, the sweep is skipped and the bytes stay: orphaned bytes cost storage, bytes deleted out from under a healthy backup cost the backup. Delete policies live in [supabase/migrations/20260714010000_backup_delete.sql](../supabase/migrations/20260714010000_backup_delete.sql) — without them RLS makes the delete a silent no-op.
- **Known gap — concurrent delete:** two devices, one creating a backup while the other deletes, can race: `createBackup` skips uploading an asset the delete is about to sweep. Single-user, narrow window, and it needs the sync work (Phase 8) to fix properly. Not addressed.
- **Never exercised on a device.** The native path (expo `File`/`Directory`/`Paths` staging, single-shot upload) is API-correct and typechecks, but has only ever run on web.
- **Supabase layout:** private bucket `user-backups`; assets at `users/<uid>/assets/<sha256>`; manifests at `users/<uid>/backups/<backupId>/manifest.json`; table `backup_snapshots` (list/status/version only); RLS by `auth.uid()`, no service key in client; resumable uploads > 6 MB.
- **Safe backup:** upload missing Blobs → upload immutable manifest → mark `complete`; never overwrite a backup; keep N versions; GC assets only after checking all manifests.
- **Safe restore:** download + validate manifest → stage Blobs in a staging area → verify hashes + schema → snapshot "Before cloud restore" → activate only on full success.
- **Sync (8):** `stories`/`scenes` in Postgres, `SceneRecord` as JSONB + `revision`; outbox + revision-check first. Reuses the `STALE_REVISION` concept already in [lib/bridge-protocol.ts](../lib/bridge-protocol.ts).
